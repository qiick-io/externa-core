<?php

use App\Enums\PermissionEnum;
use App\Jobs\DuplicateFilesJob;
use App\Jobs\ImportCollectionJob;
use App\Jobs\PrepareFilesZipJob;
use App\Models\User;
use App\Notifications\FileDuplicationFailedNotification;
use App\Notifications\FileZipFailedNotification;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Notification;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    Notification::fake();
});

test('PrepareFilesZipJob failed notifies the requesting user', function () {
    $user = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanDownloadFiles->value,
    ]);

    $job = new PrepareFilesZipJob($user->id, [1], 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    $job->failed(new RuntimeException('zip timed out'));

    Notification::assertSentTo($user, FileZipFailedNotification::class, function (FileZipFailedNotification $notification): bool {
        return $notification->jobId === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
            && str_contains($notification->message, 'zip timed out');
    });
});

test('DuplicateFilesJob failed notifies the requesting user', function () {
    $user = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanCreateFiles->value,
    ]);

    $job = new DuplicateFilesJob($user->id, [1], null, 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee');
    $job->failed(new RuntimeException('copy failed'));

    Notification::assertSentTo($user, FileDuplicationFailedNotification::class, function (FileDuplicationFailedNotification $notification): bool {
        return $notification->jobId === 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'
            && str_contains($notification->message, 'copy failed');
    });
});

test('ImportCollectionJob failed reports status and records the exception', function () {
    $user = User::factory()->create();
    $job = new ImportCollectionJob(
        userId: $user->id,
        conversationId: null,
        sourceType: 'csv',
    );

    $job->failed(new RuntimeException('import boom'));

    $status = ImportCollectionJob::status($job->jobId);
    expect($status['status'])->toBe('failed')
        ->and($status['message'])->toContain('import boom');
});

test('long-running jobs declare timeout tries and backoff', function () {
    $zip = new PrepareFilesZipJob(1, [], 'id');
    $dup = new DuplicateFilesJob(1, [], null, 'id');
    $import = new ImportCollectionJob(1, null, 'csv');

    expect($zip->timeout)->toBe(300)
        ->and($zip->tries)->toBe(2)
        ->and($zip->backoff())->toBe([30, 60])
        ->and($dup->timeout)->toBe(300)
        ->and($dup->tries)->toBe(2)
        ->and($import->timeout)->toBe(600)
        ->and($import->tries)->toBe(2);
});
