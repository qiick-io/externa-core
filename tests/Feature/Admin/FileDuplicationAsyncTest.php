<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Jobs\DuplicateFilesJob;
use App\Models\File;
use App\Models\User;
use App\Notifications\FileDuplicationCompleted;
use App\Services\FileService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;

function grantAsyncFilePermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-file-async-'.uniqid(),
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

test('small single file duplicates synchronously', function () {
    $user = grantAsyncFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCopyFiles->value,
    ]);
    $this->actingAs($user);

    Storage::disk('assets')->put('2026/07/small.txt', 'hello');

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'small.txt',
        'path' => '/small.txt',
        'disk' => 'assets',
        'storage_path' => '2026/07/small.txt',
        'size' => 5,
        'mime_type' => 'text/plain',
    ]);

    Queue::fake();

    $this->postJson(route('files.copy', $file))
        ->assertCreated()
        ->assertJsonPath('name', 'small copy.txt');

    Queue::assertNothingPushed();
    expect(File::query()->where('name', 'small copy.txt')->exists())->toBeTrue();
});

test('folder duplicate returns 202 and dispatches job', function () {
    $user = grantAsyncFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCopyFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Docs',
        'path' => '/Docs',
        'disk' => 'assets',
    ]);

    Queue::fake();

    $this->postJson(route('files.copy', $folder))
        ->assertAccepted()
        ->assertJsonPath('queued', true)
        ->assertJsonStructure(['queued', 'job_id']);

    Queue::assertPushed(DuplicateFilesJob::class, function (DuplicateFilesJob $job) use ($user, $folder): bool {
        return $job->userId === $user->id
            && $job->fileIds === [$folder->id]
            && $job->targetParentId === null;
    });
});

test('large single file duplicate returns 202', function () {
    config(['files.duplicate_sync_max_bytes' => 10]);

    $user = grantAsyncFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCopyFiles->value,
    ]);
    $this->actingAs($user);

    Storage::disk('assets')->put('2026/07/large.bin', str_repeat('a', 100));

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'large.bin',
        'path' => '/large.bin',
        'disk' => 'assets',
        'storage_path' => '2026/07/large.bin',
        'size' => 100,
        'mime_type' => 'application/octet-stream',
    ]);

    Queue::fake();

    $this->postJson(route('files.copy', $file))
        ->assertAccepted()
        ->assertJsonPath('queued', true);

    Queue::assertPushed(DuplicateFilesJob::class);
});

test('bulk copy always queues', function () {
    $user = grantAsyncFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCopyFiles->value,
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

    $this->postJson(route('files.bulk'), [
        'action' => 'copy',
        'ids' => [$first->id, $second->id],
    ])
        ->assertAccepted()
        ->assertJsonPath('queued', true);

    Queue::assertPushed(DuplicateFilesJob::class, function (DuplicateFilesJob $job) use ($first, $second): bool {
        return $job->fileIds === [$first->id, $second->id];
    });
});

test('folder duplicate job completes with notification payload the files page can poll', function () {
    $user = grantAsyncFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCopyFiles->value,
    ]);
    $this->actingAs($user);

    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Pollable',
        'path' => '/Pollable',
        'disk' => 'assets',
    ]);

    $response = $this->postJson(route('files.copy', $folder))
        ->assertAccepted()
        ->assertJsonPath('queued', true);

    $jobId = $response->json('job_id');
    expect($jobId)->toBeString()->not->toBeEmpty();

    // phpunit.xml uses QUEUE_CONNECTION=sync, so the job already finished.
    expect(File::query()->where('name', 'Pollable copy')->exists())->toBeTrue();

    $listResponse = $this->getJson(route('notifications.index'))
        ->assertOk();

    $match = collect($listResponse->json('data'))->first(
        fn (array $notification): bool => ($notification['data']['job_id'] ?? null) === $jobId
            && ($notification['data']['type'] ?? null) === 'file_duplication_completed',
    );

    expect($match)->not->toBeNull();
    expect($match['data']['path'] ?? null)->toBe('/Pollable copy');
});

test('duplicate job creates copy and database notification', function () {
    Notification::fake();

    $user = grantAsyncFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCopyFiles->value,
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

    $jobUuid = '11111111-1111-1111-1111-111111111111';

    (new DuplicateFilesJob($user->id, [$file->id], null, $jobUuid))->handle(
        app(FileService::class),
    );

    expect(File::query()->where('name', 'queued copy.txt')->exists())->toBeTrue();

    Notification::assertSentTo($user, FileDuplicationCompleted::class, function (FileDuplicationCompleted $notification) use ($jobUuid): bool {
        return $notification->jobId === $jobUuid
            && $notification->count === 1;
    });
});
