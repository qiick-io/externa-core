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
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\FileService;
use App\Services\FileTransformService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
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

    app(CollectionItemValuesWriter::class)->sync(
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

    // Without include=files: raw id (even if file read is later granted).
    $this->getJson("/api/v1/collections/articles/items/{$item->id}")
        ->assertOk()
        ->assertJsonPath('data.data.cover', $file->id);

    // With include=files but without file read: id + access denied signal
    $this->getJson("/api/v1/collections/articles/items/{$item->id}?include=files")
        ->assertOk()
        ->assertJsonPath('data.data.cover.id', $file->id)
        ->assertJsonPath('data.data.cover.access', 'denied')
        ->assertJsonMissingPath('data.data.cover.url');

    grantPublicFileActions([FilePermissionAction::Read]);

    $this->getJson("/api/v1/collections/articles/items/{$item->id}?include=files")
        ->assertOk()
        ->assertJsonPath('data.data.cover.id', $file->id)
        ->assertJsonPath('data.data.cover.filename', 'cover.jpg')
        ->assertJsonPath('data.data.cover.url', url("/api/v1/files/{$file->id}/content"))
        ->assertJsonMissingPath('data.data.cover.access');
});

it('expands nested files inside blocks fields on item api when file read is granted', function (): void {
    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'articles',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'content',
        'type' => FieldTypeEnum::Blocks,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'media',
                    'label' => 'Media',
                    'fields' => [
                        ['name' => 'image', 'type' => 'image', 'settings' => []],
                        ['name' => 'gallery', 'type' => 'files', 'settings' => []],
                    ],
                ],
            ],
        ],
    ]);

    $cover = makeStoredFile('nested-cover.jpg');
    $gallery = makeStoredFile('nested-gallery.jpg');
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection->fresh(['fields']),
        ['content' => [[
            'id' => '11111111-1111-1111-1111-111111111111',
            'type' => 'media',
            'data' => [
                'image' => $cover->id,
                'gallery' => [$gallery->id],
            ],
        ]]],
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

    $this->getJson("/api/v1/collections/articles/items/{$item->id}")
        ->assertOk()
        ->assertJsonPath('data.data.content.0.data.image', $cover->id)
        ->assertJsonPath('data.data.content.0.data.gallery.0', $gallery->id);

    $this->getJson("/api/v1/collections/articles/items/{$item->id}?include=files")
        ->assertOk()
        ->assertJsonPath('data.data.content.0.data.image.id', $cover->id)
        ->assertJsonPath('data.data.content.0.data.image.access', 'denied')
        ->assertJsonPath('data.data.content.0.data.gallery.0.id', $gallery->id)
        ->assertJsonPath('data.data.content.0.data.gallery.0.access', 'denied')
        ->assertJsonMissingPath('data.data.content.0.data.image.url');

    grantPublicFileActions([FilePermissionAction::Read]);

    $this->getJson("/api/v1/collections/articles/items/{$item->id}?include=files")
        ->assertOk()
        ->assertJsonPath('data.data.content.0.data.image.filename', 'nested-cover.jpg')
        ->assertJsonPath('data.data.content.0.data.gallery.0.filename', 'nested-gallery.jpg')
        ->assertJsonPath('data.data.content.0.data.image.url', url("/api/v1/files/{$cover->id}/content"));
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

it('hides private files from list show content without read_private', function (): void {
    grantPublicFileActions([FilePermissionAction::Read]);
    $public = makeStoredFile('public.jpg');
    $private = makeStoredFile('secret.jpg');
    $private->update(['access' => 'private']);

    $this->getJson('/api/v1/files')
        ->assertOk()
        ->assertJsonFragment(['filename' => 'public.jpg'])
        ->assertJsonMissing(['filename' => 'secret.jpg']);

    $this->getJson("/api/v1/files/{$private->id}")->assertForbidden();
    $this->get("/api/v1/files/{$private->id}/content")->assertForbidden();

    $this->getJson("/api/v1/files/{$public->id}")->assertOk();
});

it('allows private file access when role has read_private', function (): void {
    grantPublicFileActions([FilePermissionAction::Read, FilePermissionAction::ReadPrivate]);
    $private = makeStoredFile('secret.jpg');
    $private->update(['access' => 'private']);

    $this->getJson('/api/v1/files')
        ->assertOk()
        ->assertJsonFragment(['filename' => 'secret.jpg']);

    $this->getJson("/api/v1/files/{$private->id}")
        ->assertOk()
        ->assertJsonPath('data.access', 'private');

    $this->get("/api/v1/files/{$private->id}/content")->assertOk();
});

it('inherits private access from folder and allows public override on child', function (): void {
    grantPublicFileActions([FilePermissionAction::Read]);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'vault',
        'path' => '/vault',
        'disk' => 'assets',
        'access' => 'private',
    ]);

    $inherited = makeStoredFile('inside.jpg');
    $inherited->update(['parent_id' => $folder->id, 'access' => null, 'path' => '/vault/inside.jpg']);

    $overridden = makeStoredFile('public-in-vault.jpg');
    $overridden->update([
        'parent_id' => $folder->id,
        'access' => 'public',
        'path' => '/vault/public-in-vault.jpg',
    ]);

    expect($inherited->fresh()->effectiveAccess()->value)->toBe('private')
        ->and($overridden->fresh()->effectiveAccess()->value)->toBe('public');

    $this->getJson('/api/v1/files?parent_id='.$folder->id)
        ->assertOk()
        ->assertJsonFragment(['filename' => 'public-in-vault.jpg'])
        ->assertJsonMissing(['filename' => 'inside.jpg']);

    $this->getJson("/api/v1/files/{$inherited->id}")->assertForbidden();
    $this->getJson("/api/v1/files/{$overridden->id}")->assertOk();
});

it('nulls private image fields on items without read_private even when collection is readable', function (): void {
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

    $file = makeStoredFile('private-cover.jpg');
    $file->update(['access' => 'private']);
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    app(CollectionItemValuesWriter::class)->sync(
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
    grantPublicFileActions([FilePermissionAction::Read]);

    $this->getJson("/api/v1/collections/articles/items/{$item->id}?include=files")
        ->assertOk()
        ->assertJsonPath('data.data.cover', null);

    grantPublicFileActions([FilePermissionAction::Read, FilePermissionAction::ReadPrivate]);

    $this->getJson("/api/v1/collections/articles/items/{$item->id}?include=files")
        ->assertOk()
        ->assertJsonPath('data.data.cover.id', $file->id)
        ->assertJsonPath('data.data.cover.url', url("/api/v1/files/{$file->id}/content"));
});

it('omits private nested block images without read_private', function (): void {
    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'articles',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'content',
        'type' => FieldTypeEnum::Blocks,
        'settings' => [
            'block_types' => [
                [
                    'key' => 'media',
                    'label' => 'Media',
                    'fields' => [
                        ['name' => 'image', 'type' => 'image', 'settings' => []],
                        ['name' => 'gallery', 'type' => 'files', 'settings' => []],
                    ],
                ],
            ],
        ],
    ]);

    $privateImage = makeStoredFile('block-private.jpg');
    $privateImage->update(['access' => 'private']);
    $publicGallery = makeStoredFile('block-public.jpg');
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection->fresh(['fields']),
        ['content' => [[
            'id' => '22222222-2222-2222-2222-222222222222',
            'type' => 'media',
            'data' => [
                'image' => $privateImage->id,
                'gallery' => [$publicGallery->id, $privateImage->id],
            ],
        ]]],
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
    grantPublicFileActions([FilePermissionAction::Read]);

    $this->getJson("/api/v1/collections/articles/items/{$item->id}?include=files")
        ->assertOk()
        ->assertJsonPath('data.data.content.0.data.image', null)
        ->assertJsonCount(1, 'data.data.content.0.data.gallery')
        ->assertJsonPath('data.data.content.0.data.gallery.0.id', $publicGallery->id)
        ->assertJsonMissingPath('data.data.content.0.data.gallery.1');
});
