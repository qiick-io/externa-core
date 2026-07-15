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
            ->has('files')
            ->has('breadcrumbs')
            ->where('parentId', null));
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
            ->has('files', 1)
            ->where('files.0.name', 'deleted.txt'));

    $this->get(route('files.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('admin/files/index')
            ->has('files', 1)
            ->where('files.0.name', 'active.txt'));
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

    $response = $this->getJson(route('collections.items.options', $books).'?'.http_build_query([
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
