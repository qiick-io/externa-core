<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\User;
use App\Services\Ai\AiToolExecutorService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    config([
        'ai.tools.enabled' => true,
        'ai.tools.write_enabled' => false,
        'ai.tools.allow' => [],
        'ai.tools.deny' => [],
    ]);
});

it('returns invalid_args when required schema fields are missing', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        [],
        $user,
    );

    expect($outcome->status)->toBe('invalid_args')
        ->and($outcome->message)->toContain('collection_id');
});

it('returns denied when the actor lacks abilities', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        ['collection_id' => 1],
        $user,
    );

    expect($outcome->status)->toBe('denied');
});

it('returns denied for write tools when write_enabled is false', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'ManageCollections',
        ['action' => 'list'],
        $user,
    );

    expect($outcome->status)->toBe('denied');
});

it('allows write tools when include_write is opted in', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);
    $this->actingAs($user);

    $outcome = app(AiToolExecutorService::class)->execute(
        'ManageCollections',
        ['action' => 'list'],
        $user,
        ['include_write' => true],
    );

    expect($outcome->status)->toBe('ok')
        ->and($outcome->result)->not->toBeNull();
});

it('executes a read tool when allowed', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    // Actor is passed explicitly — executor binds auth for tool-level ChecksAiPermissionsTrait.
    $collection = Collection::factory()->create();

    $outcome = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        ['collection_id' => $collection->id],
        $user,
    );

    expect($outcome->status)->toBe('ok')
        ->and($outcome->result)->toContain('"collection_id": '.$collection->id);
});

it('returns disabled when the registry master switch is off', function (): void {
    config(['ai.tools.enabled' => false]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    $outcome = app(AiToolExecutorService::class)->execute(
        'QueryCollectionItems',
        ['collection_id' => 1],
        $user,
    );

    expect($outcome->status)->toBe('disabled');
});

it('returns not_found for unknown tools', function (): void {
    $outcome = app(AiToolExecutorService::class)->execute(
        'DoesNotExist',
        [],
        User::factory()->create(),
    );

    expect($outcome->status)->toBe('not_found');
});
