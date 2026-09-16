<?php

use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\File;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Files\FileWhereUsedScanner;
use App\Services\FileService;
use App\Support\Files\FilesDisk;
use App\Support\Storage\AbsolutePath;
use Database\Seeders\PermissionSeeder;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();

    Config::set('files.disk', 's3');
    Storage::fake('s3');
});

test('FILES_DISK defaults to configured s3 disk', function () {
    expect(FilesDisk::default())->toBe('s3')
        ->and(FilesDisk::allowed())->toContain('s3', 'assets');
});

test('file manager upload and download work on FILES_DISK=s3', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);
    $this->actingAs($user);

    $response = $this->postJson(route('files.upload'), [
        'file' => UploadedFile::fake()->create('remote.txt', 12, 'text/plain'),
    ]);

    $response->assertCreated()
        ->assertJsonPath('disk', 's3')
        ->assertJsonPath('name', 'remote.txt');

    $file = File::query()->where('name', 'remote.txt')->firstOrFail();
    expect($file->disk)->toBe('s3');
    Storage::disk('s3')->assertExists($file->storage_path);

    $this->get(route('files.download', $file))
        ->assertOk();
});

test('zip archive builds from remote disk without Storage::path', function () {
    $service = app(FileService::class);

    $path = '2026/09/zip-me.txt';
    Storage::disk('s3')->put($path, 'zip-payload');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'zip-me.txt',
        'path' => '/zip-me.txt',
        'disk' => 's3',
        'storage_path' => $path,
        'mime_type' => 'text/plain',
        'size' => 11,
    ]);

    $zipPath = $service->buildZipArchive([$file->id]);
    expect(is_file($zipPath))->toBeTrue()
        ->and(filesize($zipPath))->toBeGreaterThan(0);

    @unlink($zipPath);
});

test('where-used finds references for files stored on s3 disk', function () {
    $collection = Collection::factory()->create();
    CollectionField::factory()->for($collection)->create([
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'cover.jpg',
        'path' => '/cover.jpg',
        'disk' => 's3',
        'storage_path' => '2026/09/cover.jpg',
        'mime_type' => 'image/jpeg',
    ]);

    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, ['cover' => $file->id], true),
    );

    $refs = app(FileWhereUsedScanner::class)->findReferences((int) $file->id);

    expect($refs)->toHaveCount(1)
        ->and($refs[0]['item_id'])->toBe($item->id);
});

test('AbsolutePath materializes non-local disks to a temp file', function () {
    Config::set('filesystems.disks.remote.driver', 's3');

    $disk = Mockery::mock(Filesystem::class);
    $disk->shouldReceive('exists')->once()->with('chat/note.txt')->andReturn(true);
    $disk->shouldReceive('get')->once()->with('chat/note.txt')->andReturn('hello-remote');

    Storage::shouldReceive('disk')->once()->with('remote')->andReturn($disk);

    $resolved = AbsolutePath::resolve('remote', 'chat/note.txt');

    expect(is_file($resolved))->toBeTrue()
        ->and(file_get_contents($resolved))->toBe('hello-remote');

    @unlink($resolved);
});
