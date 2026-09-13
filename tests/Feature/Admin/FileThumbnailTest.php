<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\User;
use App\Services\FileTransformService;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;

function grantThumbnailPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-file-thumbnail-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    Storage::fake('assets');
});

test('guests cannot request file thumbnails', function () {
    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'photo.jpg',
        'path' => '/photo.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/photo.jpg',
        'mime_type' => 'image/jpeg',
    ]);

    $this->get(route('files.thumbnail', $file))->assertRedirect(route('login'));
});

test('users without show-files permission cannot request thumbnails', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'photo.jpg',
        'path' => '/photo.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/photo.jpg',
        'mime_type' => 'image/jpeg',
    ]);

    $this->get(route('files.thumbnail', $file))->assertForbidden();
});

test('image thumbnail endpoint returns a cached image and creates the transform file', function () {
    $user = grantThumbnailPermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $upload = UploadedFile::fake()->image('hero.png', 640, 480);

    $created = $this->postJson(route('files.upload'), [
        'file' => $upload,
    ])->assertCreated();

    $fileId = $created->json('id');
    expect($created->json('thumbnail_url'))->toBe(route('files.thumbnail', ['file' => $fileId]));
    expect($created->json('url'))->not->toBeNull();

    $file = File::query()->findOrFail($fileId);

    $response = $this->get(route('files.thumbnail', $file));

    $response->assertOk();
    expect($response->headers->get('content-type'))->toContain('image/');

    $cachePath = app(FileTransformService::class)->ensureThumbnail($file);
    Storage::disk('assets')->assertExists($cachePath);
});

test('non-image files cannot request thumbnails', function () {
    $user = grantThumbnailPermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'notes.txt',
        'path' => '/notes.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/notes.txt',
        'mime_type' => 'text/plain',
    ]);

    Storage::disk('assets')->put($file->storage_path, 'hello');

    $this->get(route('files.thumbnail', $file))->assertStatus(422);
});

test('file list resource includes thumbnail_url for images and null for other files', function () {
    $user = grantThumbnailPermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $image = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'cover.jpg',
        'path' => '/cover.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/cover.jpg',
        'mime_type' => 'image/jpeg',
        'hash' => 'abc',
    ]);

    $document = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'brief.pdf',
        'path' => '/brief.pdf',
        'disk' => 'assets',
        'storage_path' => '2026/07/brief.pdf',
        'mime_type' => 'application/pdf',
    ]);

    $response = $this->getJson(route('files.list'));

    $response->assertOk();

    $rows = collect($response->json('data'));
    $imageRow = $rows->firstWhere('id', $image->id);
    $documentRow = $rows->firstWhere('id', $document->id);

    expect($imageRow['thumbnail_url'])->toBe(route('files.thumbnail', $image));
    expect($imageRow['url'])->not->toBeNull();
    expect($documentRow['thumbnail_url'])->toBeNull();
    expect($documentRow['url'])->not->toBeNull();
});

test('thumbnail endpoint honors a named transform preset key', function () {
    $user = grantThumbnailPermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
        PermissionEnum::CanManageProjectSettings->value,
    ]);
    $this->actingAs($user);

    app(SettingsRepository::class)->setMany(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        [
            'allowed_transformations' => ['thumbnail'],
            'preset_transformations' => [[
                'key' => 'card',
                'fit' => 'cover',
                'width' => 200,
                'height' => 120,
                'quality' => 80,
                'without_enlargement' => true,
                'format' => 'png',
            ]],
        ],
    );

    $created = $this->postJson(route('files.upload'), [
        'file' => UploadedFile::fake()->image('card-source.png', 400, 300),
    ])->assertCreated();

    $file = File::query()->findOrFail($created->json('id'));

    $response = $this->get(route('files.thumbnail', ['file' => $file, 'key' => 'card']));
    $response->assertOk();
    expect($response->headers->get('content-type'))->toContain('image/png');

    $cachePath = app(FileTransformService::class)->ensureTransform($file, key: 'card');
    Storage::disk('assets')->assertExists($cachePath);
    expect($cachePath)->toEndWith('.png');
});

test('replacing an image clears cached thumbnails for the previous storage path', function () {
    $user = grantThumbnailPermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
        PermissionEnum::CanReplaceFiles->value,
    ]);
    $this->actingAs($user);

    $created = $this->postJson(route('files.upload'), [
        'file' => UploadedFile::fake()->image('before.png', 320, 240),
    ])->assertCreated();

    $file = File::query()->findOrFail($created->json('id'));
    $this->get(route('files.thumbnail', $file))->assertOk();

    $oldCachePath = app(FileTransformService::class)->ensureThumbnail($file);
    Storage::disk('assets')->assertExists($oldCachePath);

    $this->postJson(route('files.replace', $file), [
        'file' => UploadedFile::fake()->image('before.png', 400, 300),
    ])->assertOk();

    Storage::disk('assets')->assertMissing($oldCachePath);
});
