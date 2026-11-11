<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\AiPrompt;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
});

it('lets a prompt manager create, update and delete any prompt', function (): void {
    $manager = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanManageAiPrompts->value,
    ]);
    $someoneElsesPrompt = AiPrompt::factory()->create(['created_by' => User::factory()->create()->id]);
    $gate = Gate::forUser($manager);

    expect($gate->allows('create', AiPrompt::class))->toBeTrue()
        ->and($gate->allows('update', $someoneElsesPrompt))->toBeTrue()
        ->and($gate->allows('delete', $someoneElsesPrompt))->toBeTrue();
});

it('denies an AI user without the manage permission, even for their own prompt', function (): void {
    $user = grantAiPermissions(User::factory()->create(), [PermissionEnum::CanUseAi->value]);
    $ownPrompt = AiPrompt::factory()->create(['created_by' => $user->id]);
    $gate = Gate::forUser($user);

    expect($gate->allows('create', AiPrompt::class))->toBeFalse()
        ->and($gate->allows('update', $ownPrompt))->toBeFalse()
        ->and($gate->allows('delete', $ownPrompt))->toBeFalse();
});

it('grants a super-admin', function (): void {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);
    $prompt = AiPrompt::factory()->create();
    $gate = Gate::forUser($superAdmin);

    expect($gate->allows('create', AiPrompt::class))->toBeTrue()
        ->and($gate->allows('update', $prompt))->toBeTrue()
        ->and($gate->allows('delete', $prompt))->toBeTrue();
});

it('denies a guest', function (): void {
    $prompt = AiPrompt::factory()->create();

    expect(Gate::forUser(null)->allows('create', AiPrompt::class))->toBeFalse()
        ->and(Gate::forUser(null)->allows('delete', $prompt))->toBeFalse();
});
