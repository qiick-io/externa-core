<?php

declare(strict_types=1);

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;

beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
});

function conversationOwnedBy(User $user): Conversation
{
    return $user->conversations()->create([
        'id' => (string) Str::uuid7(),
        'title' => 'Policy test',
    ]);
}

it('lets the participant view, update and delete their conversation', function (): void {
    $owner = User::factory()->create();
    $conversation = conversationOwnedBy($owner);
    $gate = Gate::forUser($owner);

    expect($gate->allows('view', $conversation))->toBeTrue()
        ->and($gate->allows('update', $conversation))->toBeTrue()
        ->and($gate->allows('delete', $conversation))->toBeTrue();
});

it('denies another user', function (): void {
    $conversation = conversationOwnedBy(User::factory()->create());
    $gate = Gate::forUser(User::factory()->create());

    expect($gate->allows('view', $conversation))->toBeFalse()
        ->and($gate->allows('update', $conversation))->toBeFalse()
        ->and($gate->allows('delete', $conversation))->toBeFalse();
});

it('denies a super-admin a conversation they do not own', function (): void {
    $superAdmin = User::factory()->create();
    $superAdmin->assignRole(RoleEnum::SuperAdmin->value);
    $conversation = conversationOwnedBy(User::factory()->create());

    expect(Gate::forUser($superAdmin)->allows('view', $conversation))->toBeFalse()
        ->and(Gate::forUser($superAdmin)->allows('delete', $conversation))->toBeFalse();
});

it('denies a guest and a conversation without a participant', function (): void {
    $owner = User::factory()->create();
    $orphan = Conversation::query()->create([
        'id' => (string) Str::uuid7(),
        'title' => 'Orphan',
    ]);

    expect(Gate::forUser(null)->allows('view', conversationOwnedBy($owner)))->toBeFalse()
        ->and(Gate::forUser($owner)->allows('view', $orphan))->toBeFalse();
});
