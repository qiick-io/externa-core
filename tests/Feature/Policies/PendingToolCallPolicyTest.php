<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\PendingToolCall;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    config(['ai.tools.enabled' => true]);
});

/**
 * A pending ManageFiles call, which needs any file permission to decide.
 */
function pendingFilesToolCall(?User $requester = null): PendingToolCall
{
    return PendingToolCall::factory()->create([
        'tool' => 'ManageFiles',
        'requested_by' => $requester?->id ?? User::factory(),
    ]);
}

it('lets a user with the tool abilities approve and reject', function (): void {
    $approver = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
    ]);
    $pending = pendingFilesToolCall();

    expect(Gate::forUser($approver)->allows('approve', $pending))->toBeTrue()
        ->and(Gate::forUser($approver)->allows('reject', $pending))->toBeTrue();
});

it('denies approve and reject without the tool abilities', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $pending = pendingFilesToolCall();

    expect(Gate::forUser($user)->allows('approve', $pending))->toBeFalse()
        ->and(Gate::forUser($user)->allows('reject', $pending))->toBeFalse();
});

it('lets the requester withdraw but not approve without the tool abilities', function (): void {
    $requester = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $pending = pendingFilesToolCall($requester);

    expect(Gate::forUser($requester)->allows('reject', $pending))->toBeTrue()
        ->and(Gate::forUser($requester)->allows('approve', $pending))->toBeFalse();
});

it('keeps self-approval allowed for a requester with the tool abilities (#441 open)', function (): void {
    $requester = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowFiles->value,
    ]);
    $pending = pendingFilesToolCall($requester);

    expect(Gate::forUser($requester)->allows('approve', $pending))->toBeTrue();
});

it('denies an unknown tool even to a super-admin, except the requester withdrawing', function (): void {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);
    $pending = PendingToolCall::factory()->create(['tool' => 'NoSuchTool', 'requested_by' => $superAdmin->id]);

    expect(Gate::forUser($superAdmin)->allows('approve', $pending))->toBeFalse()
        ->and(Gate::forUser($superAdmin)->allows('reject', $pending))->toBeTrue();
});

it('grants a super-admin through the tool abilities', function (): void {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);
    $pending = pendingFilesToolCall();

    expect(Gate::forUser($superAdmin)->allows('approve', $pending))->toBeTrue()
        ->and(Gate::forUser($superAdmin)->allows('reject', $pending))->toBeTrue();
});

it('denies a guest', function (): void {
    $pending = pendingFilesToolCall();

    expect(Gate::forUser(null)->allows('approve', $pending))->toBeFalse()
        ->and(Gate::forUser(null)->allows('reject', $pending))->toBeFalse();
});
