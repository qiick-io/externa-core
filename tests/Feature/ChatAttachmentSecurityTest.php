<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\Role;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use App\Support\Http\UserContentResponse;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
    Storage::fake('local');
    Storage::fake('assets');
    Storage::fake('public');
});

function secRealUpload(string $name, string $body): UploadedFile
{
    $tmp = tempnam(sys_get_temp_dir(), 'sec');
    file_put_contents($tmp, $body);

    return new UploadedFile($tmp, $name, null, null, true);
}

const SEC_HTML = "<!doctype html><html><body><script>/*poc*/</script></body></html>\n";

/**
 * @return array{user: User, collection: Collection, item: CollectionItem}
 */
function secChatContext(array $permissions): array
{
    $role = Role::query()->create(['name' => 'sec-chat-'.uniqid(), 'guard_name' => 'web']);
    $role->syncPermissions($permissions);
    $user = User::factory()->create();
    $user->syncRoles([$role]);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    return compact('user', 'collection', 'item');
}

test('item chat attachment routes require can-show-chat', function () {
    ['user' => $viewer, 'collection' => $collection, 'item' => $item] = secChatContext([
        PermissionEnum::CanShowCollections->value,
    ]);
    expect($viewer->can(PermissionEnum::CanShowChat->value))->toBeFalse();

    $this->actingAs($viewer);
    $this->postJson(route('collections.items.chat.attachments.store', [$collection, $item]), [
        'file' => secRealUpload('notes.txt', 'hello'),
    ])->assertForbidden();

    $this->postJson(route('collections.items.chat.attachments.uploads.init', [$collection, $item]), [
        'file_name' => 'notes.txt',
        'total_size' => 5,
        'total_chunks' => 1,
        'mime_type' => 'text/plain',
    ])->assertForbidden();

    $attachment = CollectionItemChatAttachment::query()->create([
        'id' => (string) Str::uuid7(),
        'user_id' => $viewer->id,
        'original_name' => 'x.txt',
        'mime_type' => 'text/plain',
        'disk' => CollectionItemChatAttachment::DISK,
        'path' => 'chat-attachments/x.txt',
        'size' => 1,
        'expires_at' => now()->addHour(),
    ]);
    Storage::disk(CollectionItemChatAttachment::DISK)->put($attachment->path, 'x');

    $this->get(route('collections.items.chat.attachments.show', [$collection, $item, $attachment->id]))
        ->assertForbidden();
});

test('item chat attachment routes succeed with can-show-chat and fail when chat module disabled', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = secChatContext([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanShowChat->value,
    ]);
    $this->actingAs($user);

    $this->postJson(route('collections.items.chat.attachments.store', [$collection, $item]), [
        'file' => secRealUpload('notes.txt', "hello world\n"),
    ])->assertCreated();

    $modules = config('settings.project.defaults.sidebar_modules');
    foreach ($modules as &$module) {
        if ($module['id'] === 'chat') {
            $module['enabled'] = false;
        }
    }
    unset($module);
    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'sidebar_modules',
        $modules,
    );
    expect(app(ProjectSettings::class)->isSidebarModuleEnabled('chat'))->toBeFalse();

    $this->postJson(route('collections.items.chat.attachments.store', [$collection, $item]), [
        'file' => secRealUpload('notes2.txt', "hello again\n"),
    ])->assertForbidden();
});

test('chat upload rejects html disguised as txt svg and html extensions', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = secChatContext([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanShowChat->value,
    ]);
    $this->actingAs($user);

    $this->postJson(route('collections.items.chat.attachments.store', [$collection, $item]), [
        'file' => secRealUpload('notes.txt', SEC_HTML),
    ])->assertUnprocessable();

    $svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>/*x*/</script></svg>';
    $this->postJson(route('collections.items.chat.attachments.store', [$collection, $item]), [
        'file' => secRealUpload('icon.svg', $svg),
    ])->assertUnprocessable();

    $this->postJson(route('collections.items.chat.attachments.store', [$collection, $item]), [
        'file' => secRealUpload('page.html', SEC_HTML),
    ])->assertUnprocessable();
});

test('chat chunked upload ignores client mime and rejects html payload', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = secChatContext([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanShowChat->value,
    ]);
    $this->actingAs($user);

    // .bin not allowlisted at init
    $this->postJson(route('collections.items.chat.attachments.uploads.init', [$collection, $item]), [
        'file_name' => 'report.bin',
        'total_size' => strlen(SEC_HTML),
        'total_chunks' => 1,
        'mime_type' => 'text/html',
    ])->assertUnprocessable();

    // allowlisted name but dangerous content → rejected on complete
    $init = $this->postJson(route('collections.items.chat.attachments.uploads.init', [$collection, $item]), [
        'file_name' => 'report.txt',
        'total_size' => strlen(SEC_HTML),
        'total_chunks' => 1,
        'mime_type' => 'text/html',
    ])->assertCreated()->json();

    $this->post(route('collections.items.chat.attachments.uploads.chunk', [$collection, $item]), [
        'upload_id' => $init['upload_id'],
        'chunk_index' => 0,
        'chunk' => UploadedFile::fake()->createWithContent('blob', SEC_HTML),
    ])->assertNoContent();

    $this->postJson(route('collections.items.chat.attachments.uploads.complete', [$collection, $item]), [
        'upload_id' => $init['upload_id'],
    ])->assertUnprocessable();
});

test('chat upload over default size cap is rejected', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = secChatContext([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanShowChat->value,
    ]);
    $this->actingAs($user);

    expect(app(ProjectSettings::class)->chatMaxUploadBytes())->toBe(25 * 1024 * 1024);

    $over = (25 * 1024 * 1024) + 1;
    $this->postJson(route('collections.items.chat.attachments.uploads.init', [$collection, $item]), [
        'file_name' => 'big.txt',
        'total_size' => $over,
        'total_chunks' => 1,
        'mime_type' => 'text/plain',
    ])->assertUnprocessable();
});

test('legacy html chat attachment is served as attachment with nosniff and sandbox csp', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = secChatContext([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanShowChat->value,
    ]);
    $this->actingAs($user);

    $path = 'chat-attachments/legacy.html';
    Storage::disk(CollectionItemChatAttachment::DISK)->put($path, SEC_HTML);
    $attachment = CollectionItemChatAttachment::query()->create([
        'id' => (string) Str::uuid7(),
        'user_id' => $user->id,
        'original_name' => 'legacy.html',
        'mime_type' => 'text/html',
        'disk' => CollectionItemChatAttachment::DISK,
        'path' => $path,
        'size' => strlen(SEC_HTML),
        'expires_at' => now()->addHour(),
    ]);

    $res = $this->get(route('collections.items.chat.attachments.show', [$collection, $item, $attachment->id]));
    $res->assertOk();
    expect($res->headers->get('Content-Disposition'))->toStartWith('attachment')
        ->and($res->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($res->headers->get('Content-Security-Policy'))->toContain('sandbox')
        ->and($res->headers->get('Content-Type'))->not->toStartWith('text/html');
});

test('png chat attachment is served inline with image type nosniff and sandbox csp', function () {
    ['user' => $user, 'collection' => $collection, 'item' => $item] = secChatContext([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanShowChat->value,
    ]);
    $this->actingAs($user);

    $upload = $this->postJson(route('collections.items.chat.attachments.store', [$collection, $item]), [
        'file' => UploadedFile::fake()->image('shot.png', 40, 30),
    ])->assertCreated()->json('attachment');

    $res = $this->get(route('collections.items.chat.attachments.show', [$collection, $item, $upload['id']]));
    $res->assertOk();
    expect($res->headers->get('Content-Disposition'))->toStartWith('inline')
        ->and($res->headers->get('Content-Type'))->toStartWith('image/png')
        ->and($res->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($res->headers->get('Content-Security-Policy'))->toBe(UserContentResponse::CSP);
});
