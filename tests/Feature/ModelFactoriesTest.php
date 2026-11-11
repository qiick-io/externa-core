<?php

declare(strict_types=1);

use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FileTypeEnum;
use App\Models\ApiKey;
use App\Models\Chat;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatMessage;
use App\Models\CollectionPermission;
use App\Models\File;
use App\Models\Role;

/*
 * The factories added in #288 must build rows the schema and the domain accept, so tests
 * can replace inline `->create([...])` arrays with them.
 */

test('the role factory creates an assignable custom role', function () {
    $role = Role::factory()->create();

    expect($role->is_system)->toBeFalse()
        ->and($role->is_assignable)->toBeTrue()
        ->and($role->isLockedSystemRole())->toBeFalse()
        ->and(Role::factory()->system()->create()->isLockedSystemRole())->toBeTrue();
});

test('the api key factory stores the hash of a chosen secret and stays active by default', function () {
    $secret = ApiKey::generateSecret();
    $apiKey = ApiKey::factory()->withSecret($secret)->create();

    expect($apiKey->key_hash)->toBe(ApiKey::hashSecret($secret['plain']))
        ->and($apiKey->uuid)->not->toBeEmpty()
        ->and($apiKey->role)->toBeInstanceOf(Role::class)
        ->and($apiKey->revoked_at)->toBeNull()
        ->and(ApiKey::factory()->revoked()->create()->revoked_at)->not->toBeNull();
});

test('the collection permission factory grants one action of a role on a collection', function () {
    $permission = CollectionPermission::factory()->action(CollectionPermissionActionEnum::Update)->create();

    expect($permission->allowed)->toBeTrue()
        ->and($permission->action)->toBe(CollectionPermissionActionEnum::Update)
        ->and($permission->role)->not->toBeNull()
        ->and($permission->collection)->not->toBeNull();
});

test('the file factory creates files, folders and nested images', function () {
    $folder = File::factory()->folder()->create();
    $image = File::factory()->image(800, 600)->inFolder($folder)->create();

    expect($folder->type)->toBe(FileTypeEnum::Folder)
        ->and($image->parent_id)->toBe($folder->id)
        ->and($image->path)->toBe($folder->path.'/'.$image->name)
        ->and($image->width)->toBe(800)
        ->and($image->uuid)->not->toBeEmpty();
});

test('the chat factories create an item thread with a message and a direct thread', function () {
    $message = CollectionItemChatMessage::factory()->create();
    $itemChat = $message->chat;

    expect($itemChat->isItem())->toBeTrue()
        ->and($itemChat->collection_id)->toBe(CollectionItem::query()->findOrFail($itemChat->collection_item_id)->collection_id)
        ->and($itemChat->messages()->count())->toBe(1)
        ->and(Chat::factory()->direct()->create()->isDirect())->toBeTrue();
});
