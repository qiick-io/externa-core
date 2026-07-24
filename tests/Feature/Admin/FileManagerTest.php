<?php

use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\FileUpload;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;
use Spatie\Tags\Tag;

function grantFilePermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-file-manager-'.uniqid(),
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

test('guests cannot access file manager routes', function () {
    $this->get(route('files.index'))->assertRedirect(route('login'));
    $this->postJson(route('files.folders.store'), ['name' => 'Docs'])->assertUnauthorized();
});

test('authenticated users without file permissions are blocked', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->get(route('files.index'))->assertForbidden();
    $this->postJson(route('files.folders.store'), ['name' => 'Blocked'])
        ->assertForbidden();
});

test('authorized users can create folders via json api', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $response = $this->postJson(route('files.folders.store'), [
        'name' => 'Marketing',
    ]);

    $response->assertCreated()
        ->assertJsonPath('name', 'Marketing')
        ->assertJsonPath('type', FileTypeEnum::Folder->value);

    $folder = File::query()->where('name', 'Marketing')->first();
    expect($folder)->not->toBeNull();
    expect($folder->type)->toBe(FileTypeEnum::Folder);
    expect($folder->path)->toBe('/Marketing');
});

test('file manager index renders grid props for authorized users', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $this->get(route('files.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->has('files.data')
            ->has('files.current_page')
            ->has('breadcrumbs')
            ->where('parentId', null)
            ->where('filters.sort', 'name')
            ->where('filters.direction', 'asc'));
});

test('file manager opens folders via path param and redirects invalid folders to root', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Docs',
        'path' => '/Docs',
        'disk' => 'assets',
    ]);

    $nested = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'readme.txt',
        'path' => '/Docs/readme.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/readme.txt',
        'parent_id' => $folder->id,
    ]);

    $this->get(route('files.index', ['folder' => $folder->id]))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->where('parentId', $folder->id)
            ->has('breadcrumbs', 1)
            ->where('breadcrumbs.0.id', $folder->id)
            ->where('files.data.0.name', 'readme.txt'));

    expect(route('files.index', ['folder' => $folder->id]))
        ->toEndWith('/files/'.$folder->id)
        ->not->toContain('parent_id');

    $this->get(route('files.index', ['folder' => $nested->id]))
        ->assertRedirect(route('files.index'));

    $this->get('/files/999999')
        ->assertRedirect(route('files.index'));

    $trashedFolder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Gone',
        'path' => '/Gone',
        'disk' => 'assets',
    ]);
    $trashedFolder->delete();

    $this->get(route('files.index', [
        'folder' => $trashedFolder->id,
        'trashed' => 'only',
    ]))->assertRedirect(route('files.index', ['trashed' => 'only']));
});

test('super admin can manage files without explicit file permissions', function () {
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $this->get(route('files.index'))->assertOk();

    $this->postJson(route('files.folders.store'), [
        'name' => 'Super Folder',
    ])->assertCreated()
        ->assertJsonPath('name', 'Super Folder');

    $upload = UploadedFile::fake()->create('super.pdf', 50, 'application/pdf');

    $this->postJson(route('files.upload'), [
        'file' => $upload,
    ])->assertCreated()
        ->assertJsonPath('name', 'super.pdf');
});

test('duplicate folder names in the same parent are allowed', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $this->postJson(route('files.folders.store'), [
        'name' => 'Assets',
    ])->assertCreated();

    $this->postJson(route('files.folders.store'), [
        'name' => 'Assets',
    ])->assertCreated();

    expect(File::query()->where('name', 'Assets')->whereNull('parent_id')->count())->toBe(2);
});

test('duplicate file names in the same parent are allowed', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $firstUpload = UploadedFile::fake()->create('report.pdf', 100, 'application/pdf');
    $secondUpload = UploadedFile::fake()->create('report.pdf', 100, 'application/pdf');

    $this->postJson(route('files.upload'), [
        'file' => $firstUpload,
    ])->assertCreated()
        ->assertJsonPath('name', 'report.pdf');

    $this->postJson(route('files.upload'), [
        'file' => $secondUpload,
    ])->assertCreated()
        ->assertJsonPath('name', 'report.pdf');

    expect(File::query()->where('name', 'report.pdf')->whereNull('parent_id')->count())->toBe(2);
});

test('authorized users can upload files', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $upload = UploadedFile::fake()->create('report.pdf', 100, 'application/pdf');

    $response = $this->postJson(route('files.upload'), [
        'file' => $upload,
    ]);

    $response->assertCreated()
        ->assertJsonPath('name', 'report.pdf')
        ->assertJsonPath('type', FileTypeEnum::File->value);

    expect(File::query()->where('name', 'report.pdf')->exists())->toBeTrue();
});

test('authorized users can upload files into nested folders', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $rootFolder = $this->postJson(route('files.folders.store'), [
        'name' => 'Project',
    ])->assertCreated()->json();

    $nestedFolder = $this->postJson(route('files.folders.store'), [
        'name' => 'Assets',
        'parent_id' => $rootFolder['id'],
    ])->assertCreated()->json();

    $upload = UploadedFile::fake()->create('logo.png', 50, 'image/png');

    $this->postJson(route('files.upload'), [
        'file' => $upload,
        'parent_id' => $nestedFolder['id'],
    ])->assertCreated()
        ->assertJsonPath('name', 'logo.png')
        ->assertJsonPath('parent_id', $nestedFolder['id']);

    expect(File::query()->where('name', 'logo.png')->where('parent_id', $nestedFolder['id'])->exists())->toBeTrue();
});

test('file manager index can filter trashed files only', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDeleteFiles->value,
    ]);
    $this->actingAs($user);

    $activeFile = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'active.txt',
        'path' => '/active.txt',
        'disk' => 'assets',
        'storage_path' => '2026/06/active.txt',
    ]);

    $trashedFile = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'deleted.txt',
        'path' => '/deleted.txt',
        'disk' => 'assets',
        'storage_path' => '2026/06/deleted.txt',
    ]);
    $trashedFile->delete();

    $this->get(route('files.index', ['trashed' => 'only']))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->where('filters.trashed', 'only')
            ->has('files.data', 1)
            ->where('files.data.0.name', 'deleted.txt'));

    $this->get(route('files.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->has('files.data', 1)
            ->where('files.data.0.name', 'active.txt'));
});

test('trash index lists soft-deleted files from nested folders', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDeleteFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Nested',
        'path' => '/Nested',
        'disk' => 'assets',
    ]);

    $nestedTrashed = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'nested-deleted.txt',
        'path' => '/Nested/nested-deleted.txt',
        'disk' => 'assets',
        'storage_path' => '2026/06/nested-deleted.txt',
        'parent_id' => $folder->id,
    ]);
    $nestedTrashed->delete();

    $this->get(route('files.index', ['trashed' => 'only']))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->where('filters.trashed', 'only')
            ->has('files.data', 1)
            ->where('files.data.0.name', 'nested-deleted.txt'));
});

test('authorized users can restore and force delete trashed files', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanRestoreFiles->value,
        PermissionEnum::CanForceDeleteFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'restore-me.txt',
        'path' => '/restore-me.txt',
        'disk' => 'assets',
        'storage_path' => '2026/06/restore-me.txt',
    ]);
    $file->delete();

    $this->postJson(route('files.restore', $file))
        ->assertOk()
        ->assertJsonPath('name', 'restore-me.txt');

    expect(File::query()->where('name', 'restore-me.txt')->exists())->toBeTrue();

    $file->refresh();
    $file->delete();

    $this->deleteJson(route('files.force-delete', $file))
        ->assertNoContent();

    expect(File::withTrashed()->where('name', 'restore-me.txt')->exists())->toBeFalse();
});

test('collection items options endpoint returns related items', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $authors = Collection::factory()->create(['name' => 'Authors']);
    $books = Collection::factory()->create(['name' => 'Books']);

    $authorField = CollectionField::factory()->for($authors)->create([
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);

    $authorItem = CollectionItem::factory()->for($authors)->create();
    $authorItem->fieldValues()->create([
        'field_id' => $authorField->id,
        'locale' => null,
        'position' => 0,
        'value' => 'Jane Doe',
    ]);

    $relationField = CollectionField::factory()->for($books)->create([
        'name' => 'author',
        'type' => FieldTypeEnum::Relation,
        'settings' => [
            'related_collection_id' => $authors->id,
            'display_field' => 'name',
        ],
    ]);

    $response = $this->getJson(route('collections.items.field-options', $books).'?'.http_build_query([
        'field_id' => $relationField->id,
        'search' => 'Jane',
    ]));

    $response->assertOk()
        ->assertJsonPath('data.0.id', $authorItem->id)
        ->assertJsonPath('data.0.label', 'Jane Doe');
});

test('authorized users can complete chunked file uploads', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $totalChunks = 2;
    $chunkSize = 5 * 1024 * 1024;
    $fileSize = $chunkSize + 1024;
    $fileContent = str_repeat('a', $fileSize);

    $initResponse = $this->postJson(route('files.uploads.init'), [
        'file_name' => 'large.bin',
        'total_size' => $fileSize,
        'total_chunks' => $totalChunks,
        'mime_type' => 'application/octet-stream',
    ]);

    $initResponse->assertCreated();
    $uploadId = $initResponse->json('upload_id');

    for ($chunkIndex = 0; $chunkIndex < $totalChunks; $chunkIndex++) {
        $start = $chunkIndex * $chunkSize;
        $chunkContent = substr($fileContent, $start, $chunkSize);

        $this->post(route('files.uploads.chunk'), [
            'upload_id' => $uploadId,
            'chunk_index' => $chunkIndex,
            'chunk' => UploadedFile::fake()->createWithContent("chunk-{$chunkIndex}.bin", $chunkContent),
        ])->assertNoContent();
    }

    $this->getJson(route('files.uploads.status', ['upload_id' => $uploadId]))
        ->assertOk()
        ->assertJsonPath('uploaded_chunks', $totalChunks);

    $this->postJson(route('files.uploads.complete'), [
        'upload_id' => $uploadId,
    ])->assertCreated()
        ->assertJsonPath('name', 'large.bin');

    expect(File::query()->where('name', 'large.bin')->exists())->toBeTrue();
});

test('stale file uploads cleanup command removes expired uploads and chunks', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $initResponse = $this->postJson(route('files.uploads.init'), [
        'file_name' => 'stale.bin',
        'total_size' => 1024,
        'total_chunks' => 1,
        'mime_type' => 'application/octet-stream',
    ])->assertCreated();

    $uploadId = $initResponse->json('upload_id');

    $this->post(route('files.uploads.chunk'), [
        'upload_id' => $uploadId,
        'chunk_index' => 0,
        'chunk' => UploadedFile::fake()->create('stale.bin', 1, 'application/octet-stream'),
    ])->assertNoContent();

    $fileUpload = FileUpload::query()->where('upload_id', $uploadId)->first();
    expect($fileUpload)->not->toBeNull();

    $fileUpload->update(['expires_at' => now()->subHour()]);

    Storage::disk('assets')->assertExists("chunks/{$uploadId}/chunk_0");

    $this->artisan('files:cleanup-uploads')
        ->assertSuccessful();

    expect(FileUpload::query()->where('upload_id', $uploadId)->exists())->toBeFalse();
    Storage::disk('assets')->assertMissing("chunks/{$uploadId}/chunk_0");
});

test('collection item can store image file id field', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->for($collection)->create([
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'cover.jpg',
        'path' => '/cover.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/06/cover.jpg',
        'mime_type' => 'image/jpeg',
    ]);

    $response = $this->post(route('collections.items.store', $collection), [
        'data' => [
            'cover' => $file->id,
        ],
    ]);

    $response->assertRedirect();

    $item = CollectionItem::query()->where('collection_id', $collection->id)->first();
    expect($item)->not->toBeNull();
    expect($item->fieldValues()->first()?->value)->toBe($file->id);
});

test('file manager index paginates folder listings', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    foreach (range(1, 55) as $index) {
        File::query()->create([
            'type' => FileTypeEnum::File,
            'name' => sprintf('file-%02d.txt', $index),
            'path' => sprintf('/file-%02d.txt', $index),
            'disk' => 'assets',
            'storage_path' => sprintf('2026/07/file-%02d.txt', $index),
        ]);
    }

    $this->get(route('files.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->has('files.data', 50)
            ->where('files.per_page', 50)
            ->where('files.total', 55)
            ->where('files.last_page', 2));
});

test('file manager list json paginates and returns coherent page totals', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Paged',
        'path' => '/Paged',
        'disk' => 'assets',
    ]);

    foreach (range(1, 55) as $index) {
        File::query()->create([
            'type' => FileTypeEnum::File,
            'name' => sprintf('item-%02d.txt', $index),
            'path' => sprintf('/Paged/item-%02d.txt', $index),
            'disk' => 'assets',
            'storage_path' => sprintf('2026/07/item-%02d.txt', $index),
            'parent_id' => $folder->id,
        ]);
    }

    $pageOne = $this->getJson(route('files.list', [
        'parent_id' => $folder->id,
        'page' => 1,
        'sort' => 'name',
        'direction' => 'asc',
    ]))->assertOk()->json();

    expect($pageOne['per_page'])->toBe(50)
        ->and($pageOne['total'])->toBe(55)
        ->and($pageOne['current_page'])->toBe(1)
        ->and($pageOne['last_page'])->toBe(2)
        ->and($pageOne['data'])->toHaveCount(50);

    $pageTwo = $this->getJson(route('files.list', [
        'parent_id' => $folder->id,
        'page' => 2,
        'sort' => 'name',
        'direction' => 'asc',
    ]))->assertOk()->json();

    expect($pageTwo['current_page'])->toBe(2)
        ->and($pageTwo['data'])->toHaveCount(5);

    $pageOneIds = collect($pageOne['data'])->pluck('id');
    $pageTwoIds = collect($pageTwo['data'])->pluck('id');

    expect($pageOneIds->intersect($pageTwoIds))->toBeEmpty()
        ->and($pageOneIds->merge($pageTwoIds)->unique())->toHaveCount(55);
});

test('file manager list json searches name path and title on the backend', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'alpha.txt',
        'title' => 'First',
        'path' => '/alpha.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/alpha.txt',
    ]);
    File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'beta.txt',
        'title' => 'Needle match',
        'path' => '/beta.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/beta.txt',
    ]);

    $byName = $this->getJson(route('files.list', ['search' => 'alpha', 'page' => 1]))
        ->assertOk()
        ->json('data');
    expect($byName)->toHaveCount(1)->and($byName[0]['name'])->toBe('alpha.txt');

    $byTitle = $this->getJson(route('files.list', ['search' => 'Needle', 'page' => 1]))
        ->assertOk()
        ->json('data');
    expect($byTitle)->toHaveCount(1)->and($byTitle[0]['name'])->toBe('beta.txt');
});

test('file manager index and list reset to page one when sort changes', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    foreach (range(1, 55) as $index) {
        File::query()->create([
            'type' => FileTypeEnum::File,
            'name' => sprintf('sort-%02d.txt', $index),
            'path' => sprintf('/sort-%02d.txt', $index),
            'disk' => 'assets',
            'storage_path' => sprintf('2026/07/sort-%02d.txt', $index),
        ]);
    }

    $this->get(route('files.index', [
        'sort' => 'name',
        'direction' => 'desc',
        'page' => 2,
    ]))->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->where('filters.sort', 'name')
            ->where('filters.direction', 'desc')
            // Index always serves page 1; load-more uses files.list.
            ->where('files.current_page', 1)
            ->has('files.data', 50)
            ->where('files.data.0.name', 'sort-55.txt'));

    $listPageOne = $this->getJson(route('files.list', [
        'sort' => 'name',
        'direction' => 'desc',
        'page' => 1,
    ]))->assertOk()->json();

    expect($listPageOne['current_page'])->toBe(1)
        ->and($listPageOne['data'][0]['name'])->toBe('sort-55.txt')
        ->and($listPageOne['data'])->toHaveCount(50);
});

test('favorites stay on early pages across load more ordering', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanFavoriteFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'FavPaged',
        'path' => '/FavPaged',
        'disk' => 'assets',
    ]);

    foreach (range(1, 55) as $index) {
        File::query()->create([
            'type' => FileTypeEnum::File,
            'name' => sprintf('fav-%02d.txt', $index),
            'path' => sprintf('/FavPaged/fav-%02d.txt', $index),
            'disk' => 'assets',
            'storage_path' => sprintf('2026/07/fav-%02d.txt', $index),
            'parent_id' => $folder->id,
        ]);
    }

    $lateFavorite = File::query()
        ->where('parent_id', $folder->id)
        ->where('name', 'fav-55.txt')
        ->firstOrFail();

    $this->postJson(route('files.favorite', $lateFavorite))->assertOk();

    $pageOne = $this->getJson(route('files.list', [
        'parent_id' => $folder->id,
        'page' => 1,
        'sort' => 'name',
        'direction' => 'asc',
    ]))->assertOk()->json('data');

    expect($pageOne[0]['name'])->toBe('fav-55.txt')
        ->and($pageOne[0]['is_favorited'])->toBeTrue();

    $pageTwoNames = collect(
        $this->getJson(route('files.list', [
            'parent_id' => $folder->id,
            'page' => 2,
            'sort' => 'name',
            'direction' => 'asc',
        ]))->assertOk()->json('data'),
    )->pluck('name');

    expect($pageTwoNames)->not->toContain('fav-55.txt');
});

test('users without download permission cannot download files', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'secret.txt',
        'path' => '/secret.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/secret.txt',
    ]);
    Storage::disk('assets')->put('2026/07/secret.txt', 'secret');

    $this->get(route('files.download', $file))->assertForbidden();
});

test('authorized users can update file metadata', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanUpdateFileMetadata->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'photo.jpg',
        'path' => '/photo.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/photo.jpg',
    ]);

    $this->patchJson(route('files.update', $file), [
        'title' => 'Hero',
        'description' => 'Homepage hero',
        'location' => 'Milan',
        'download_name' => 'hero.jpg',
        'focal_point_x' => 0.5,
        'focal_point_y' => 0.25,
        'translate_x' => -12.5,
        'translate_y' => 8,
        'scale' => 1.2,
    ])->assertOk()
        ->assertJsonPath('title', 'Hero')
        ->assertJsonPath('download_name', 'hero.jpg')
        ->assertJsonPath('location', 'Milan')
        ->assertJsonPath('focal_point_x', 0.5)
        ->assertJsonPath('focal_point_y', 0.25)
        ->assertJsonPath('translate_x', -12.5)
        ->assertJsonPath('translate_y', 8)
        ->assertJsonPath('scale', 1.2);

    $file->refresh();
    expect($file->title)->toBe('Hero');
    expect($file->description)->toBe('Homepage hero');
    expect($file->location)->toBe('Milan');
    expect($file->download_name)->toBe('hero.jpg');
    expect($file->focal_point_x)->toBe(0.5);
    expect($file->focal_point_y)->toBe(0.25);
    expect($file->translate_x)->toBe(-12.5);
    expect($file->translate_y)->toBe(8.0);
    expect($file->scale)->toBe(1.2);
});

test('file metadata update rejects non-numeric focal translate and scale', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanUpdateFileMetadata->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'photo.jpg',
        'path' => '/photo.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/photo.jpg',
        'focal_point_x' => 0.4,
        'translate_x' => 1,
        'scale' => 1,
    ]);

    $this->patchJson(route('files.update', $file), [
        'focal_point_x' => 'left',
        'focal_point_y' => 'top',
        'translate_x' => 'nope',
        'translate_y' => 'nope',
        'scale' => 'big',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors([
            'focal_point_x',
            'focal_point_y',
            'translate_x',
            'translate_y',
            'scale',
        ]);

    $file->refresh();
    expect($file->focal_point_x)->toBe(0.4);
    expect($file->translate_x)->toBe(1.0);
    expect($file->scale)->toBe(1.0);
});

test('authorized users can favorite and unfavorite files', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanFavoriteFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'fav.txt',
        'path' => '/fav.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/fav.txt',
    ]);

    $this->postJson(route('files.favorite', $file))
        ->assertOk()
        ->assertJsonPath('is_favorited', true);

    expect($file->favoritedBy()->where('user_id', $user->id)->exists())->toBeTrue();

    $this->deleteJson(route('files.unfavorite', $file))
        ->assertOk()
        ->assertJsonPath('is_favorited', false);

    expect($file->favoritedBy()->where('user_id', $user->id)->exists())->toBeFalse();
});

test('file listing sorts favorites first then folders then user field', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanFavoriteFiles->value,
    ]);
    $this->actingAs($user);

    File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'alpha.txt',
        'path' => '/alpha.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/alpha.txt',
    ]);
    $zetaFile = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'zeta.txt',
        'path' => '/zeta.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/zeta.txt',
    ]);
    File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'mike.txt',
        'path' => '/mike.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/mike.txt',
    ]);
    File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'bravo',
        'path' => '/bravo',
        'disk' => 'assets',
    ]);
    $yankeeFolder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'yankee',
        'path' => '/yankee',
        'disk' => 'assets',
    ]);

    $this->postJson(route('files.favorite', $zetaFile))->assertOk();
    $this->postJson(route('files.favorite', $yankeeFolder))->assertOk();

    $ascendingNames = collect(
        $this->getJson(route('files.list'))->assertOk()->json('data'),
    )->pluck('name')->all();

    // Favorites first (folder before file), then non-favorites (folder before files), name asc.
    expect($ascendingNames)->toBe(['yankee', 'zeta.txt', 'bravo', 'alpha.txt', 'mike.txt']);

    $this->get(route('files.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->where('filters.sort', 'name')
            ->where('filters.direction', 'asc')
            ->where('files.data.0.name', 'yankee')
            ->where('files.data.1.name', 'zeta.txt')
            ->where('files.data.2.name', 'bravo')
            ->where('files.data.3.name', 'alpha.txt')
            ->where('files.data.4.name', 'mike.txt'));

    $descendingNames = collect(
        $this->getJson(route('files.list', [
            'sort' => 'name',
            'direction' => 'desc',
        ]))->assertOk()->json('data'),
    )->pluck('name')->all();

    // Same favorite/type groups; name desc among peer files (mike before alpha).
    expect($descendingNames)->toBe(['yankee', 'zeta.txt', 'bravo', 'mike.txt', 'alpha.txt']);

    $this->get(route('files.index', [
        'sort' => 'name',
        'direction' => 'desc',
    ]))->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('filters.sort', 'name')
            ->where('filters.direction', 'desc')
            ->where('files.data.0.name', 'yankee')
            ->where('files.data.3.name', 'mike.txt')
            ->where('files.data.4.name', 'alpha.txt'));

    $this->getJson(route('files.list', ['sort' => 'invalid']))
        ->assertUnprocessable();
    $this->getJson(route('files.list', ['direction' => 'sideways']))
        ->assertUnprocessable();
});

test('authorized users can sync tags on files', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanTagFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'tagged.txt',
        'path' => '/tagged.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/tagged.txt',
    ]);

    $response = $this->putJson(route('files.tags', $file), [
        'tags' => ['brand', 'campaign'],
    ])->assertOk()
        ->assertJsonPath('tags.0.name', 'brand')
        ->assertJsonPath('tags.0.slug', 'brand')
        ->assertJsonPath('tags.1.name', 'campaign')
        ->assertJsonPath('tags.1.slug', 'campaign');

    expect($response->json('tags'))->toBeArray();
    expect($response->json('tags.0'))->toHaveKeys(['id', 'name', 'slug']);
    expect($file->fresh()->tags->pluck('name')->all())->toBe(['brand', 'campaign']);
    expect($file->tags()->count())->toBe(2);
    $this->assertDatabaseHas('taggables', [
        'taggable_id' => $file->id,
        'taggable_type' => $file->getMorphClass(),
    ]);
});

test('file tag sync rejects comma-separated strings', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanTagFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'csv-tags.txt',
        'path' => '/csv-tags.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/csv-tags.txt',
    ]);

    $this->putJson(route('files.tags', $file), [
        'tags' => 'brand, campaign',
    ])->assertUnprocessable();

    expect($file->fresh()->tags)->toHaveCount(0);
});

test('authorized users can bulk attach tags as arrays', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanTagFiles->value,
    ]);
    $this->actingAs($user);

    $firstFile = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'bulk-a.txt',
        'path' => '/bulk-a.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/bulk-a.txt',
    ]);
    $secondFile = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'bulk-b.txt',
        'path' => '/bulk-b.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/bulk-b.txt',
    ]);

    $this->postJson(route('files.bulk'), [
        'action' => 'tag',
        'ids' => [$firstFile->id, $secondFile->id],
        'tags' => ['shared', 'promo'],
    ])->assertOk()
        ->assertJsonPath('data.0.tags.0.name', 'shared')
        ->assertJsonPath('data.0.tags.0.slug', 'shared');

    expect($firstFile->fresh()->tags->pluck('name')->all())->toBe(['shared', 'promo']);
    expect($secondFile->fresh()->tags->pluck('name')->all())->toBe(['shared', 'promo']);
});

test('users without can-tag-files cannot mutate tags', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'no-tag.txt',
        'path' => '/no-tag.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/no-tag.txt',
    ]);

    $this->putJson(route('files.tags', $file), [
        'tags' => ['blocked'],
    ])->assertForbidden();

    $this->postJson(route('files.bulk'), [
        'action' => 'tag',
        'ids' => [$file->id],
        'tags' => ['blocked'],
    ])->assertForbidden();
});

test('exact tag name reuses the same tag row across files', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanTagFiles->value,
    ]);
    $this->actingAs($user);

    $firstFile = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'reuse-a.txt',
        'path' => '/reuse-a.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/reuse-a.txt',
    ]);
    $secondFile = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'reuse-b.txt',
        'path' => '/reuse-b.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/reuse-b.txt',
    ]);

    $this->putJson(route('files.tags', $firstFile), [
        'tags' => ['shared-brand'],
    ])->assertOk();

    $this->putJson(route('files.tags', $secondFile), [
        'tags' => ['shared-brand'],
    ])->assertOk();

    $locale = app()->getLocale();
    expect(Tag::query()->where("name->{$locale}", 'shared-brand')->count())->toBe(1);
    expect($firstFile->fresh()->tags->first()->id)
        ->toBe($secondFile->fresh()->tags->first()->id);
});

test('authorized users can list the shared file tags catalog', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanTagFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'catalog.txt',
        'path' => '/catalog.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/catalog.txt',
    ]);

    $this->putJson(route('files.tags', $file), [
        'tags' => ['alpha', 'beta'],
    ])->assertOk();

    $this->getJson(route('files.tags.index'))
        ->assertOk()
        ->assertJsonFragment(['name' => 'alpha'])
        ->assertJsonFragment(['name' => 'beta']);
});

test('file listing can resolve rows by ids without parent scope', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'nested',
        'path' => '/nested',
        'disk' => 'assets',
    ]);
    $nested = File::query()->create([
        'type' => FileTypeEnum::File,
        'parent_id' => $folder->id,
        'name' => 'nested-photo.jpg',
        'path' => '/nested/nested-photo.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/nested-photo.jpg',
        'mime_type' => 'image/jpeg',
        'extension' => 'jpg',
    ]);
    $root = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'root-doc.pdf',
        'path' => '/root-doc.pdf',
        'disk' => 'assets',
        'storage_path' => '2026/07/root-doc.pdf',
        'mime_type' => 'application/pdf',
        'extension' => 'pdf',
    ]);

    $response = $this->getJson(route('files.list', [
        'ids' => [$nested->id, $root->id],
    ]))->assertOk();

    expect($response->json('data'))->toHaveCount(2)
        ->and(collect($response->json('data'))->pluck('id')->all())
        ->toBe([$nested->id, $root->id])
        ->and($response->json('data.0.thumbnail_url'))->not->toBeNull()
        ->and($response->json('data.1.thumbnail_url'))->toBeNull();
});

test('file listing can filter by tag ids with any-of semantics', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanTagFiles->value,
    ]);
    $this->actingAs($user);

    $branded = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'branded.txt',
        'path' => '/branded.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/branded.txt',
    ]);
    $campaign = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'campaign.txt',
        'path' => '/campaign.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/campaign.txt',
    ]);
    $plain = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'plain.txt',
        'path' => '/plain.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/plain.txt',
    ]);

    $this->putJson(route('files.tags', $branded), ['tags' => ['brand']])->assertOk();
    $this->putJson(route('files.tags', $campaign), ['tags' => ['campaign']])->assertOk();

    $brandTagId = $branded->fresh()->tags->first()->id;
    $campaignTagId = $campaign->fresh()->tags->first()->id;

    $listResponse = $this->getJson(route('files.list', [
        'tag_ids' => [$brandTagId, $campaignTagId],
    ]))->assertOk();

    $listedIds = collect($listResponse->json('data'))->pluck('id')->all();
    expect($listedIds)->toContain($branded->id);
    expect($listedIds)->toContain($campaign->id);
    expect($listedIds)->not->toContain($plain->id);

    $this->get(route('files.index', [
        'tag_ids' => [$brandTagId],
    ]))->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->where('filters.tag_ids', [$brandTagId])
            ->has('files.data', 1)
            ->where('files.data.0.id', $branded->id));
});

test('file listing can filter by tag names with any-of semantics', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanTagFiles->value,
    ]);
    $this->actingAs($user);

    $branded = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'named-brand.txt',
        'path' => '/named-brand.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/named-brand.txt',
    ]);
    $other = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'named-other.txt',
        'path' => '/named-other.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/named-other.txt',
    ]);

    $this->putJson(route('files.tags', $branded), ['tags' => ['filter-me']])->assertOk();
    $this->putJson(route('files.tags', $other), ['tags' => ['skip-me']])->assertOk();

    $listResponse = $this->getJson(route('files.list', [
        'tags' => ['filter-me'],
    ]))->assertOk();

    $listedIds = collect($listResponse->json('data'))->pluck('id')->all();
    expect($listedIds)->toContain($branded->id);
    expect($listedIds)->not->toContain($other->id);
});

test('authorized users can copy files', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCopyFiles->value,
    ]);
    $this->actingAs($user);

    Storage::disk('assets')->put('2026/07/original.txt', 'hello');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'original.txt',
        'path' => '/original.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/original.txt',
        'size' => 5,
        'mime_type' => 'text/plain',
    ]);

    $response = $this->postJson(route('files.copy', $file))
        ->assertCreated()
        ->assertJsonPath('name', 'original copy.txt');

    $copy = File::query()->find($response->json('id'));
    expect($copy)->not->toBeNull();
    expect($copy->storage_path)->not->toBe($file->storage_path);
    Storage::disk('assets')->assertExists($copy->storage_path);
});

test('authorized users can replace files and create a new version', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanReplaceFiles->value,
    ]);
    $this->actingAs($user);

    Storage::disk('assets')->put('2026/07/replace-me.txt', 'v1');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'replace-me.txt',
        'path' => '/replace-me.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/replace-me.txt',
        'size' => 2,
        'mime_type' => 'text/plain',
        'extension' => 'txt',
        'hash' => hash('sha256', 'v1'),
    ]);

    $upload = UploadedFile::fake()->createWithContent('replace-me.txt', 'version-two');

    $this->postJson(route('files.replace', $file), [
        'file' => $upload,
    ])->assertOk()
        ->assertJsonPath('name', 'replace-me.txt')
        ->assertJsonPath('id', $file->id);

    $file->refresh();
    expect($file->versions()->count())->toBeGreaterThanOrEqual(1);
    expect($file->hash)->toBe(hash('sha256', 'version-two'));
    expect($file->current_version_id)->not->toBeNull();
    expect($file->parent_id)->toBeNull();
});

test('folders cannot be replaced', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanReplaceFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Docs',
        'path' => '/Docs',
        'disk' => 'assets',
    ]);

    $upload = UploadedFile::fake()->createWithContent('notes.txt', 'nope');

    $this->postJson(route('files.replace', $folder), [
        'file' => $upload,
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['file']);
});

test('replace rejects uploads with a different extension', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanReplaceFiles->value,
    ]);
    $this->actingAs($user);

    Storage::disk('assets')->put('2026/07/notes.txt', 'v1');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'notes.txt',
        'path' => '/notes.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/notes.txt',
        'size' => 2,
        'mime_type' => 'text/plain',
        'extension' => 'txt',
        'hash' => hash('sha256', 'v1'),
    ]);

    $upload = UploadedFile::fake()->createWithContent('notes.md', '# wrong');

    $this->postJson(route('files.replace', $file), [
        'file' => $upload,
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['file']);

    $file->refresh();
    expect($file->hash)->toBe(hash('sha256', 'v1'));
});

test('authorized users can bulk move files', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Target',
        'path' => '/Target',
        'disk' => 'assets',
    ]);

    $first = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'a.txt',
        'path' => '/a.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/a.txt',
    ]);
    $second = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'b.txt',
        'path' => '/b.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/b.txt',
    ]);

    $this->postJson(route('files.bulk'), [
        'action' => 'move',
        'ids' => [$first->id, $second->id],
        'parent_id' => $folder->id,
    ])->assertOk();

    expect($first->fresh()->parent_id)->toBe($folder->id);
    expect($second->fresh()->parent_id)->toBe($folder->id);
});

test('authorized users can download a single file', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);
    $this->actingAs($user);

    Storage::disk('assets')->put('2026/07/download.txt', 'payload');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'download.txt',
        'download_name' => 'custom-name.txt',
        'path' => '/download.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/download.txt',
    ]);

    $this->get(route('files.download', $file))
        ->assertOk()
        ->assertHeader('content-disposition', 'attachment; filename=custom-name.txt');
});
