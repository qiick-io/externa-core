<?php

use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Jobs\EmptyFilesTrashJob;
use App\Models\File;
use App\Models\User;
use App\Notifications\FilesTrashEmptiedNotification;
use App\Services\FileService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;

function grantEmptyTrashPermissions(User $user, array $permissions): User
{
    $role = Role::query()->firstOrCreate([
        'name' => 'test-empty-trash-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions($permissions);
    $user->syncRoles([$role]);

    return $user;
}

function createStoredTestFile(string $name, ?int $parentId = null): File
{
    Storage::disk('assets')->put("2026/11/{$name}", 'contents');

    return File::query()->create([
        'type' => FileTypeEnum::File,
        'parent_id' => $parentId,
        'name' => $name,
        'path' => "/{$name}",
        'disk' => 'assets',
        'storage_path' => "2026/11/{$name}",
        'size' => 8,
        'mime_type' => 'text/plain',
    ]);
}

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    Storage::fake('assets');
});

test('empty trash queues a background job and returns its id', function () {
    $user = grantEmptyTrashPermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanForceDeleteFiles->value,
    ]);
    $this->actingAs($user);

    Queue::fake();

    $jobId = $this->deleteJson(route('files.trash.empty'))
        ->assertAccepted()
        ->assertJsonPath('queued', true)
        ->json('job_id');

    Queue::assertPushed(
        EmptyFilesTrashJob::class,
        fn (EmptyFilesTrashJob $job): bool => $job->userId === $user->id && $job->jobUuid === $jobId,
    );
});

test('empty trash requires the force delete permission', function () {
    $user = grantEmptyTrashPermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDeleteFiles->value,
    ]);
    $this->actingAs($user);

    Queue::fake();

    $this->deleteJson(route('files.trash.empty'))->assertForbidden();

    Queue::assertNothingPushed();
});

test('the job permanently deletes trashed rows and their storage, keeps active files and notifies', function () {
    Notification::fake();

    $user = User::factory()->create();
    $folder = File::query()->create([
        'type' => FileTypeEnum::Folder,
        'name' => 'Old',
        'path' => '/Old',
        'disk' => 'assets',
    ]);
    $nested = createStoredTestFile('nested.txt', $folder->id);
    $loose = createStoredTestFile('loose.txt');
    $active = createStoredTestFile('active.txt');

    $nested->delete();
    $folder->delete();
    $loose->delete();

    (new EmptyFilesTrashJob($user->id, 'job-123'))->handle(app(FileService::class));

    expect(File::query()->withTrashed()->whereKey([$folder->id, $nested->id, $loose->id])->exists())->toBeFalse()
        ->and(File::query()->whereKey($active->id)->exists())->toBeTrue();

    Storage::disk('assets')->assertMissing('2026/11/nested.txt');
    Storage::disk('assets')->assertMissing('2026/11/loose.txt');
    Storage::disk('assets')->assertExists('2026/11/active.txt');

    Notification::assertSentTo(
        $user,
        FilesTrashEmptiedNotification::class,
        fn (FilesTrashEmptiedNotification $notification): bool => $notification->jobId === 'job-123' && $notification->count === 3,
    );
});
