<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Enums\FilePermissionAction;
use App\Enums\FileTypeEnum;
use App\Enums\RoleEnum;
use App\Jobs\WarmFileThumbnailJob;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\File;
use App\Models\FilePermission;
use App\Models\Role;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Api\FilePermissionGuard;
use App\Services\FileService;
use App\Services\FileTransformService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(\Database\Seeders\PermissionSeeder::class);
    $this->seed(\Database\Seeders\RoleSeeder::class);
    Storage::fake('assets');
});

function filesPublicRole(): Role
{
    return Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
}

/**
 * @param  list<FilePermissionAction|string>  $actions
 */
function grantFileActions(Role $role, array $actions): void
{
    foreach ($actions as $action) {
        $value = $action instanceof FilePermissionAction ? $action->value : $action;
        FilePermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'action' => $value,
            ],
            ['allowed' => true],
        );
    }

    app(FilePermissionGuard::class)->forget($role->id);
}

/**
 * @param  list<FilePermissionAction|string>  $actions
 */
function grantPublicFileActions(array $actions): void
{
    grantFileActions(filesPublicRole(), $actions);
}

/**
 * @return array{role: Role, plain: string, key: ApiKey}
 */
function makeFileApiKey(?Role $role = null): array
{
    $role ??= Role::query()->create([
        'name' => 'file-api-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    $secret = ApiKey::generateSecret();
    $key = ApiKey::query()->create([
        'name' => 'Files partner',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $role->id,
    ]);

    return ['role' => $role, 'plain' => $secret['plain'], 'key' => $key];
}

function makeStoredFile(string $name = 'hero.jpg'): File
{
    Storage::disk('assets')->put('2026/07/'.$name, 'fake-bytes');

    return File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => $name,
        'path' => '/'.$name,
        'disk' => 'assets',
        'storage_path' => '2026/07/'.$name,
        'mime_type' => 'image/jpeg',
        'size' => 10,
        'width' => 1600,
        'height' => 900,
        'hash' => hash('sha256', 'fake-bytes'),
    ]);
}

it('denies file endpoints without grants', function (): void {
    $file = makeStoredFile();

    $this->getJson('/api/v1/files')->assertForbidden();
    $this->getJson("/api/v1/files/{$file->id}")->assertForbidden();
    $this->getJson("/api/v1/files/{$file->id}/content")->assertForbidden();
    $this->getJson("/api/v1/files/{$file->id}/transforms/thumbnail")->assertForbidden();
    $this->postJson('/api/v1/files', [])->assertForbidden();
    $this->patchJson("/api/v1/files/{$file->id}", ['title' => 'x'])->assertForbidden();
    $this->deleteJson("/api/v1/files/{$file->id}")->assertForbidden();
});

it('allows anonymous read list show content when public has read', function (): void {
    grantPublicFileActions([FilePermissionAction::Read]);
    $file = makeStoredFile('photo.jpg');

    $this->getJson('/api/v1/files')
        ->assertOk()
        ->assertJsonPath('meta.current_page', 1)
        ->assertJsonFragment(['filename' => 'photo.jpg']);

    $this->getJson("/api/v1/files/{$file->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $file->id)
        ->assertJsonPath('data.url', url("/api/v1/files/{$file->id}/content"));

    $this->get("/api/v1/files/{$file->id}/content")->assertOk();
});

it('searches files via backend query param', function (): void {
    grantPublicFileActions([FilePermissionAction::Read]);
    makeStoredFile('alpha.jpg');
    makeStoredFile('beta.jpg');

    $this->getJson('/api/v1/files?search=alpha')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.filename', 'alpha.jpg');
});

it('gates create update delete independently', function (): void {
    $file = makeStoredFile();

    grantPublicFileActions([FilePermissionAction::Create]);
    Queue::fake([WarmFileThumbnailJob::class]);
    $this->post('/api/v1/files', [
        'file' => UploadedFile::fake()->image('upload.png', 40, 30),
    ])->assertCreated();

    grantPublicFileActions([FilePermissionAction::Update]);
    $this->patchJson("/api/v1/files/{$file->id}", ['title' => 'Hero'])
        ->assertOk()
        ->assertJsonPath('data.title', 'Hero');

    grantPublicFileActions([FilePermissionAction::Delete]);
    $this->deleteJson("/api/v1/files/{$file->id}")->assertNoContent();
    expect(File::query()->find($file->id))->toBeNull();
    expect(File::withTrashed()->find($file->id))->not->toBeNull();
});

it('enforces file grants for api keys', function (): void {
    $bundle = makeFileApiKey();
    $file = makeStoredFile();

    $this->withToken($bundle['plain'])
        ->getJson('/api/v1/files')
        ->assertForbidden();

    grantFileActions($bundle['role'], [FilePermissionAction::Read]);

    $this->withToken($bundle['plain'])
        ->getJson("/api/v1/files/{$file->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $file->id);
});

it('expands image fields on item api when file read is granted', function (): void {
    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'articles',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $file = makeStoredFile('cover.jpg');
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    app(\App\Services\Collections\CollectionItemValuesWriter::class)->sync(
        $item,
        $collection->fresh(['fields']),
        ['cover' => $file->id],
    );

    CollectionPermission::query()->updateOrCreate(
        [
            'role_id' => filesPublicRole()->id,
            'collection_id' => $collection->id,
            'action' => CollectionPermissionAction::Read->value,
        ],
        ['allowed' => true],
    );
    app(CollectionPermissionGuard::class)->forget(filesPublicRole()->id);

    // Without file read: id only
    $this->getJson("/api/v1/collections/articles/items/{$item->id}")
        ->assertOk()
        ->assertJsonPath('data.data.cover.id', $file->id)
        ->assertJsonMissingPath('data.data.cover.url');

    grantPublicFileActions([FilePermissionAction::Read]);

    $this->getJson("/api/v1/collections/articles/items/{$item->id}")
        ->assertOk()
        ->assertJsonPath('data.data.cover.id', $file->id)
        ->assertJsonPath('data.data.cover.filename', 'cover.jpg')
        ->assertJsonPath('data.data.cover.url', url("/api/v1/files/{$file->id}/content"));
});

it('dispatches warm thumbnail job on upload', function (): void {
    Queue::fake([WarmFileThumbnailJob::class]);
    grantPublicFileActions([FilePermissionAction::Create]);

    $this->post('/api/v1/files', [
        'file' => UploadedFile::fake()->image('warm.png', 80, 60),
    ])->assertCreated();

    Queue::assertPushed(WarmFileThumbnailJob::class);
});

it('stores a single content hash on upload', function (): void {
    grantPublicFileActions([FilePermissionAction::Create]);
    Queue::fake([WarmFileThumbnailJob::class]);

    $upload = UploadedFile::fake()->createWithContent('note.txt', 'hello-hash');
    $expected = hash('sha256', 'hello-hash');

    $response = $this->post('/api/v1/files', ['file' => $upload])->assertCreated();
    $file = File::query()->findOrFail($response->json('data.id'));

    expect($file->hash)->toBe($expected);
});

it('cover geometry respects focal point', function (): void {
    $service = app(FileTransformService::class);
    $method = new ReflectionMethod(FileTransformService::class, 'geometryCover');
    $method->setAccessible(true);

    /** @var array{src_x: int, src_y: int, src_w: int, src_h: int} $centered */
    $centered = $method->invoke($service, 1000, 500, 200, 200, false, 0.5, 0.5);
    /** @var array{src_x: int, src_y: int, src_w: int, src_h: int} $left */
    $left = $method->invoke($service, 1000, 500, 200, 200, false, 0.0, 0.5);
    /** @var array{src_x: int, src_y: int, src_w: int, src_h: int} $right */
    $right = $method->invoke($service, 1000, 500, 200, 200, false, 1.0, 0.5);

    expect($left['src_x'])->toBe(0)
        ->and($right['src_x'])->toBeGreaterThan($centered['src_x'])
        ->and($centered['src_x'])->toBeGreaterThan($left['src_x']);
});

it('clears transforms when focal point changes', function (): void {
    Queue::fake([WarmFileThumbnailJob::class]);

    $canvas = imagecreatetruecolor(400, 300);
    imagefilledrectangle($canvas, 0, 0, 399, 299, imagecolorallocate($canvas, 200, 100, 50));
    ob_start();
    imagejpeg($canvas, null, 90);
    $binary = (string) ob_get_clean();
    imagedestroy($canvas);

    Storage::disk('assets')->put('2026/07/focal.jpg', $binary);
    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'focal.jpg',
        'path' => '/focal.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/focal.jpg',
        'mime_type' => 'image/jpeg',
        'size' => strlen($binary),
        'width' => 400,
        'height' => 300,
        'hash' => hash('sha256', $binary),
    ]);

    $transform = app(FileTransformService::class);
    $path = $transform->ensureThumbnail($file, 64);
    expect(Storage::disk('assets')->exists($path))->toBeTrue();

    app(FileService::class)->updateMetadata($file, [
        'focal_point_x' => 0.2,
        'focal_point_y' => 0.8,
    ]);

    expect(Storage::disk('assets')->exists($path))->toBeFalse();
});
