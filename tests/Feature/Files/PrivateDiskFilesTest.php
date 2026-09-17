<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\User;
use App\Services\FileService;
use App\Services\FileTransformService;
use App\Support\Files\FilesDisk;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    Storage::fake('assets');
    Storage::fake('private_assets');
});

it('stores uploads into a private folder on private_assets', function (): void {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);
    $this->actingAs($user);

    $folder = app(FileService::class)->createFolder('vault');
    app(FileService::class)->updateMetadata($folder, ['access' => 'private']);

    $response = $this->postJson(route('files.upload'), [
        'file' => UploadedFile::fake()->create('secret.txt', 8, 'text/plain'),
        'parent_id' => $folder->id,
    ]);

    $response->assertCreated()
        ->assertJsonPath('disk', FilesDisk::PRIVATE_ASSETS)
        ->assertJsonPath('effective_access', 'private');

    $file = File::query()->where('name', 'secret.txt')->firstOrFail();
    expect($file->disk)->toBe(FilesDisk::PRIVATE_ASSETS)
        ->and($file->isEffectivelyPrivate())->toBeTrue();

    Storage::disk('private_assets')->assertExists($file->storage_path);
    Storage::disk('assets')->assertMissing($file->storage_path);

    expect(app(FileTransformService::class)->publicUrl($file))->toBeNull();

    $payload = $response->json();
    expect($payload['url'])->toContain('/files/'.$file->id.'/download');
});

it('moves bytes off public assets when marking a file private', function (): void {
    $service = app(FileService::class);
    $file = $service->uploadFile(UploadedFile::fake()->create('was-public.txt', 4, 'text/plain'));

    expect($file->disk)->toBe('assets');
    Storage::disk('assets')->assertExists($file->storage_path);

    $updated = $service->updateMetadata($file, ['access' => 'private']);

    expect($updated->disk)->toBe(FilesDisk::PRIVATE_ASSETS)
        ->and(app(FileTransformService::class)->publicUrl($updated))->toBeNull();

    Storage::disk('private_assets')->assertExists($updated->storage_path);
    Storage::disk('assets')->assertMissing($file->storage_path);
});

it('migrates legacy private rows still on assets via artisan command', function (): void {
    Storage::disk('assets')->put('2026/09/legacy-secret.txt', 'secret-bytes');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'legacy-secret.txt',
        'path' => '/legacy-secret.txt',
        'disk' => 'assets',
        'storage_path' => '2026/09/legacy-secret.txt',
        'mime_type' => 'text/plain',
        'size' => 12,
        'access' => 'private',
    ]);

    $this->artisan('files:migrate-private-disk')
        ->assertSuccessful();

    $file->refresh();
    expect($file->disk)->toBe(FilesDisk::PRIVATE_ASSETS);
    Storage::disk('private_assets')->assertExists($file->storage_path);
    Storage::disk('assets')->assertMissing('2026/09/legacy-secret.txt');
});

it('allows API content for private files with read_private while publicUrl stays null', function (): void {
    $service = app(FileService::class);
    $file = $service->uploadFile(UploadedFile::fake()->create('gated.txt', 6, 'text/plain'));
    $file = $service->updateMetadata($file, ['access' => 'private']);

    expect($file->disk)->toBe(FilesDisk::PRIVATE_ASSETS)
        ->and(app(FileTransformService::class)->publicUrl($file))->toBeNull();

    // Authenticated admin download still works
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);
    $this->actingAs($user)
        ->get(route('files.download', $file))
        ->assertOk();
});
