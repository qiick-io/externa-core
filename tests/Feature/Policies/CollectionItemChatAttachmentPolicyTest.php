<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Chat;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

beforeEach(function (): void {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->uploader = grantCollectionPermissions(User::factory()->create(), [PermissionEnum::CanShowCollections->value]);
    $this->stranger = grantCollectionPermissions(User::factory()->create(), [PermissionEnum::CanShowChat->value]);
    $this->superAdmin = User::factory()->create();
    $this->superAdmin->assignRole(RoleEnum::SuperAdmin->value);

    $item = makePostsCollection()->items()->create([]);
    $this->message = CollectionItemChatMessage::factory()->create([
        'chat_id' => Chat::factory()->forItem($item)->create()->id,
        'user_id' => $this->uploader->id,
    ]);
    $this->orphan = chatPolicyAttachment($this->uploader, null);
    $this->claimed = chatPolicyAttachment($this->uploader, $this->message);
});

function chatPolicyAttachment(User $uploader, ?CollectionItemChatMessage $message): CollectionItemChatAttachment
{
    return CollectionItemChatAttachment::query()->create([
        'id' => (string) Str::uuid(),
        'message_id' => $message?->id,
        'user_id' => $uploader->id,
        'original_name' => 'note.txt',
        'mime_type' => 'text/plain',
        'disk' => 'local',
        'path' => 'chat/note.txt',
        'size' => 4,
    ]);
}

it('shows an unclaimed upload to its uploader only, as not found for anyone else', function (): void {
    expect(Gate::forUser($this->uploader)->allows('view', $this->orphan))->toBeTrue()
        ->and(Gate::forUser($this->superAdmin)->inspect('view', $this->orphan)->status())->toBe(404)
        ->and(Gate::forUser($this->stranger)->inspect('view', $this->orphan)->status())->toBe(404);
});

it('shows a claimed attachment like its thread', function (): void {
    expect(Gate::forUser($this->uploader)->allows('view', $this->claimed))->toBeTrue()
        ->and(Gate::forUser($this->superAdmin)->allows('view', $this->claimed))->toBeTrue()
        ->and(Gate::forUser($this->stranger)->inspect('view', $this->claimed)->status())->toBe(404);
});

it('lets only the uploader delete an unclaimed upload', function (): void {
    expect(Gate::forUser($this->uploader)->allows('delete', $this->orphan))->toBeTrue()
        ->and(Gate::forUser($this->uploader)->allows('delete', $this->claimed))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows('delete', $this->orphan))->toBeFalse()
        ->and(Gate::forUser($this->stranger)->allows('delete', $this->orphan))->toBeFalse();
});
