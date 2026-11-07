<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\User;
use App\Support\Files\FilesDisk;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @return list<string>
 */
function cloudDiskNames(): array
{
    return ['gcs', 'azure'];
}

test('FILES_DISK gcs and azure resolve through FilesDisk and stay allowed', function (string $disk): void {
    Config::set('files.disk', $disk);

    expect(FilesDisk::default())->toBe($disk)
        ->and(FilesDisk::allowed())->toContain($disk, 'assets', 's3', FilesDisk::PRIVATE_ASSETS);
})->with(cloudDiskNames());

test('file manager upload and download work on faked GCS and Azure disks', function (string $disk): void {
    Config::set('files.disk', $disk);
    Storage::fake($disk);

    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);
    $this->actingAs($user);

    $filename = "{$disk}-remote.txt";

    $response = $this->postJson(route('files.upload'), [
        'file' => UploadedFile::fake()->create($filename, 12, 'text/plain'),
    ]);

    $response->assertCreated()
        ->assertJsonPath('disk', $disk)
        ->assertJsonPath('name', $filename);

    $file = File::query()->where('name', $filename)->firstOrFail();
    expect($file->disk)->toBe($disk);
    Storage::disk($disk)->assertExists($file->storage_path);

    $this->get(route('files.download', $file))->assertOk();
})->with(cloudDiskNames());

test('live GCS smoke put/get when credentials are configured', function (): void {
    $bucket = (string) config('filesystems.disks.gcs.bucket');
    $keyFile = (string) config('filesystems.disks.gcs.key_file_path');

    if ($bucket === '' || ($keyFile === '' && blank(getenv('GOOGLE_APPLICATION_CREDENTIALS')))) {
        $this->markTestSkipped('GCS credentials not configured (GOOGLE_CLOUD_STORAGE_BUCKET + key file / ADC).');
    }

    Config::set('files.disk', 'gcs');

    $path = 'externa-smoke/'.uniqid('gcs-', true).'.txt';
    $payload = 'gcs-smoke-'.now()->toIso8601String();

    Storage::disk('gcs')->put($path, $payload);

    expect(Storage::disk('gcs')->get($path))->toBe($payload);

    Storage::disk('gcs')->delete($path);
})->group('cloud-live');

test('live Azure smoke put/get when credentials are configured', function (): void {
    $connectionString = (string) config('filesystems.disks.azure.connection_string');
    $container = (string) config('filesystems.disks.azure.container');

    if ($connectionString === '' || $container === '') {
        $this->markTestSkipped('Azure credentials not configured (AZURE_STORAGE_CONNECTION_STRING + container).');
    }

    Config::set('files.disk', 'azure');

    $path = 'externa-smoke/'.uniqid('azure-', true).'.txt';
    $payload = 'azure-smoke-'.now()->toIso8601String();

    Storage::disk('azure')->put($path, $payload);

    expect(Storage::disk('azure')->get($path))->toBe($payload);

    Storage::disk('azure')->delete($path);
})->group('cloud-live');
