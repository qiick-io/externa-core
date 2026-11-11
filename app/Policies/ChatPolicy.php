<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\PermissionEnum;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Chat\ChatService;
use App\Support\Authorization\PolicyRequestResolver;
use Illuminate\Auth\Access\Response;

/**
 * Chat thread access: item threads follow the item's read access, direct threads their
 * participant list.
 *
 * An unreadable item thread is answered as not found (404), a direct thread the user is not
 * in as forbidden (403). Super-admins are granted through the permission resolver and the
 * collection enforcer on item threads; on direct threads they are not participants by role, so
 * a super-admin outside a direct thread is denied like anyone else (today's behaviour).
 */
final class ChatPolicy
{
    public function __construct(
        private ChatService $chats,
        private EffectivePermissionResolverService $permissionResolver,
        private CollectionPermissionEnforcerService $enforcer,
        private PolicyRequestResolver $requestResolver,
    ) {}

    public function view(?User $user, Chat $chat): Response
    {
        if ($chat->isItem()) {
            $collection = $chat->collection;
            $item = $chat->item;

            if (! $collection instanceof Collection || ! $item instanceof CollectionItem) {
                return Response::denyAsNotFound();
            }

            return $this->canAccessItemThread($user, $collection, $item)
                ? Response::allow()
                : Response::denyAsNotFound();
        }

        return $this->participate($user, $chat) ? Response::allow() : Response::deny();
    }

    /**
     * The user has a participant row on the thread (explicit or expanded from a group).
     */
    public function participate(?User $user, Chat $chat): bool
    {
        return $user instanceof User && $this->chats->isParticipant($chat, $user);
    }

    /**
     * Starting direct threads, and the people / group pickers that feed them.
     */
    public function createDirect(?User $user): bool
    {
        return $user instanceof User
            && $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateDirectChats->value);
    }

    /**
     * Opening the thread of an item: the item must belong to the collection and be readable.
     */
    public function createForItem(?User $user, Collection $collection, CollectionItem $item): bool
    {
        return (int) $item->collection_id === (int) $collection->id
            && $this->canAccessItemThread($user, $collection, $item);
    }

    /**
     * Collections menu permission, then the collection Read grant and item_filter.
     */
    private function canAccessItemThread(?User $user, Collection $collection, CollectionItem $item): bool
    {
        if (! $user instanceof User) {
            return false;
        }

        if (! $this->permissionResolver->hasPermission($user, PermissionEnum::CanShowCollections->value)) {
            return false;
        }

        return $this->enforcer->isItemReadable($this->requestResolver->forUser($user), $collection, $item);
    }
}
