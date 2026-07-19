<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Jobs\PrepareFilesZipJob;
use App\Models\File;
use App\Models\User;
use App\Notifications\FileZipReadyNotification;
use App\Services\FileService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;

function grantZipFilePermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-file-zip-'.uniqid(),
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

afterEach(function () {
    foreach (glob(storage_path('app/zips/*/*.zip')) ?: [] as $zipPath) {
        @unlink($zipPath);
    }
});

test('single file download remains synchronous', function () {
    $user = grantZipFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);
    $this->actingAs($user);

    Storage::disk('assets')->put('2026/07/single.txt', 'payload');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'single.txt',
        'path' => '/single.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/single.txt',
        'size' => 7,
        'mime_type' => 'text/plain',
    ]);

    Queue::fake();

    $this->get(route('files.download', $file))
        ->assertOk()
        ->assertHeader('content-disposition', 'attachment; filename=single.txt');

    Queue::assertNothingPushed();
});

test('bulk zip download returns 202 and dispatches job', function () {
    $user = grantZipFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);
    $this->actingAs($user);

    Storage::disk('assets')->put('2026/07/a.txt', 'a');
    Storage::disk('assets')->put('2026/07/b.txt', 'b');

    $first = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'a.txt',
        'path' => '/a.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/a.txt',
        'size' => 1,
    ]);
    $second = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'b.txt',
        'path' => '/b.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/b.txt',
        'size' => 1,
    ]);

    Queue::fake();

    $this->postJson(route('files.download-many'), [
        'ids' => [$first->id, $second->id],
    ])
        ->assertAccepted()
        ->assertJsonPath('queued', true)
        ->assertJsonStructure(['queued', 'job_id']);

    Queue::assertPushed(PrepareFilesZipJob::class, function (PrepareFilesZipJob $job) use ($user, $first, $second): bool {
        return $job->userId === $user->id
            && $job->fileIds === [$first->id, $second->id];
    });
});

test('folder zip download returns 202 and dispatches job', function () {
    $user = grantZipFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Docs',
        'path' => '/Docs',
        'disk' => 'assets',
    ]);

    Queue::fake();

    $this->postJson(route('files.download-many'), [
        'ids' => [$folder->id],
    ])
        ->assertAccepted()
        ->assertJsonPath('queued', true);

    Queue::assertPushed(PrepareFilesZipJob::class, function (PrepareFilesZipJob $job) use ($folder): bool {
        return $job->fileIds === [$folder->id];
    });
});

test('zip job creates archive and database notification', function () {
    Notification::fake();

    $user = grantZipFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);

    Storage::disk('assets')->put('2026/07/queued.txt', 'queued');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'queued.txt',
        'path' => '/queued.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/queued.txt',
        'size' => 6,
        'mime_type' => 'text/plain',
    ]);

    $jobUuid = '22222222-2222-2222-2222-222222222222';

    (new PrepareFilesZipJob($user->id, [$file->id], $jobUuid))->handle(
        app(FileService::class),
    );

    $zipPath = app(FileService::class)->zipStoragePath($user->id, $jobUuid);
    expect(is_file($zipPath))->toBeTrue();

    Notification::assertSentTo($user, FileZipReadyNotification::class, function (FileZipReadyNotification $notification) use ($jobUuid): bool {
        return $notification->jobId === $jobUuid
            && str_contains($notification->downloadUrl, $jobUuid);
    });
});

test('owner can download prepared zip', function () {
    $user = grantZipFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);
    $this->actingAs($user);

    Storage::disk('assets')->put('2026/07/ready.txt', 'ready');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'ready.txt',
        'path' => '/ready.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/ready.txt',
        'size' => 5,
    ]);

    $response = $this->postJson(route('files.download-many'), [
        'ids' => [$file->id],
    ])->assertAccepted();

    $jobId = $response->json('job_id');
    expect($jobId)->toBeString()->not->toBeEmpty();

    // phpunit.xml uses QUEUE_CONNECTION=sync, so the job already finished.
    $this->get(route('files.zips.download', $jobId))
        ->assertOk()
        ->assertHeader('content-disposition', 'attachment; filename=files.zip');
});

test('other users cannot download another users prepared zip', function () {
    $owner = grantZipFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);
    $other = grantZipFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);

    Storage::disk('assets')->put('2026/07/secret.txt', 'secret');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'secret.txt',
        'path' => '/secret.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/secret.txt',
        'size' => 6,
    ]);

    $this->actingAs($owner);
    $jobId = $this->postJson(route('files.download-many'), [
        'ids' => [$file->id],
    ])->assertAccepted()->json('job_id');

    $this->actingAs($other);
    $this->get(route('files.zips.download', $jobId))->assertNotFound();
});

test('users without download permission cannot queue zip', function () {
    $user = grantZipFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'denied.txt',
        'path' => '/denied.txt',
        'disk' => 'assets',
    ]);

    $this->postJson(route('files.download-many'), [
        'ids' => [$file->id],
    ])->assertForbidden();
});

test('folder zip includes nested children with sensible paths', function () {
    $user = grantZipFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);

    Storage::disk('assets')->put('2026/07/nested.txt', 'nested');

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Parent',
        'path' => '/Parent',
        'disk' => 'assets',
    ]);
    $child = File::query()->create([
        'type' => FileTypeEnum::File,
        'parent_id' => $folder->id,
        'name' => 'nested.txt',
        'path' => '/Parent/nested.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/nested.txt',
        'size' => 6,
    ]);

    $jobUuid = '33333333-3333-3333-3333-333333333333';
    $fileService = app(FileService::class);

    $zipPath = $fileService->buildZipArchive(
        [$folder->id],
        $fileService->zipStoragePath($user->id, $jobUuid),
    );

    $zip = new ZipArchive;
    expect($zip->open($zipPath))->toBeTrue();
    expect($zip->locateName('Parent/'))->not->toBeFalse();
    expect($zip->locateName('Parent/nested.txt'))->not->toBeFalse();
    $zip->close();

    expect($child->id)->toBeInt();
});
