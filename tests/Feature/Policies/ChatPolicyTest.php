<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Chat;
use App\Models\ChatParticipant;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;

beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->posts = makePostsCollection();
    $this->item = $this->posts->items()->create([]);
    $this->itemChat = Chat::factory()->forItem($this->item)->create();

    $this->member = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateDirectChats->value,
    ]);
    $this->outsider = grantCollectionPermissions(User::factory()->create(), [PermissionEnum::CanShowChat->value]);
    $this->superAdmin = User::factory()->create();
    $this->superAdmin->assignRole(RoleEnum::SuperAdmin->value);

    $this->directChat = Chat::factory()->direct()->create(['created_by_user_id' => $this->member->id]);
    ChatParticipant::query()->create([
        'chat_id' => $this->directChat->id,
        'user_id' => $this->member->id,
        'user_group_id' => null,
        'source' => ChatParticipant::SOURCE_EXPLICIT,
    ]);
});

it('lets a collection reader view an item thread and hides it from others as not found', function (): void {
    expect(Gate::forUser($this->member)->allows('view', $this->itemChat))->toBeTrue()
        ->and(Gate::forUser($this->superAdmin)->allows('view', $this->itemChat))->toBeTrue()
        ->and(Gate::forUser($this->outsider)->inspect('view', $this->itemChat)->status())->toBe(404)
        ->and(Gate::forUser(null)->inspect('view', $this->itemChat)->status())->toBe(404);
});

it('opens a direct thread to participants only, super-admins included', function (): void {
    $denial = Gate::forUser($this->superAdmin)->inspect('view', $this->directChat);

    expect(Gate::forUser($this->member)->allows('view', $this->directChat))->toBeTrue()
        ->and(Gate::forUser($this->member)->allows('participate', $this->directChat))->toBeTrue()
        ->and($denial->denied())->toBeTrue()
        ->and($denial->status())->toBeNull()
        ->and(Gate::forUser($this->outsider)->allows('participate', $this->directChat))->toBeFalse();
});

it('requires the direct chat permission to start a direct thread', function (): void {
    expect(Gate::forUser($this->member)->allows('createDirect', Chat::class))->toBeTrue()
        ->and(Gate::forUser($this->superAdmin)->allows('createDirect', Chat::class))->toBeTrue()
        ->and(Gate::forUser($this->outsider)->allows('createDirect', Chat::class))->toBeFalse()
        ->and(Gate::forUser(null)->allows('createDirect', Chat::class))->toBeFalse();
});

it('opens an item thread only for a readable item of that collection', function (): void {
    $foreignItem = CollectionItem::factory()->create();

    expect(Gate::forUser($this->member)->allows('createForItem', [Chat::class, $this->posts, $this->item]))->toBeTrue()
        ->and(Gate::forUser($this->superAdmin)->allows('createForItem', [Chat::class, $this->posts, $this->item]))->toBeTrue()
        ->and(Gate::forUser($this->member)->allows('createForItem', [Chat::class, $this->posts, $foreignItem]))->toBeFalse()
        ->and(Gate::forUser($this->outsider)->allows('createForItem', [Chat::class, $this->posts, $this->item]))->toBeFalse();
});
