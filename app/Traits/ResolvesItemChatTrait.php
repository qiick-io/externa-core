<?php

declare(strict_types=1);

namespace App\Traits;

use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Route guards shared by the item-form chat controllers (`collections/{collection}/items/{item}/chat/...`).
 *
 * The item thread is resolved from `{item}`, never from a chat id in the URL, so every
 * lookup also checks that the item belongs to `{collection}` and is readable (404 when
 * not, so foreign items stay invisible). The using controller injects
 * `private ChatService $chats`.
 */
trait ResolvesItemChatTrait
{
    /**
     * Abort with 404 when the item is not in the route collection or not readable.
     */
    private function assertItemContext(Request $request, Collection $collection, CollectionItem $item): void
    {
        abort_unless((int) $item->collection_id === (int) $collection->id, 404);
        abort_unless(Gate::forUser($request->user())->allows('view', [$item, $collection]), 404);
    }

    private function chatForItem(Request $request, Collection $collection, CollectionItem $item): Chat
    {
        $this->assertItemContext($request, $collection, $item);

        return $this->existingItemChat($item);
    }

    /**
     * The item's thread, 404 when it has none yet. Callers have checked the
     * item context already (here or in the form request's `authorize()`).
     */
    private function existingItemChat(CollectionItem $item): Chat
    {
        $chat = $this->chats->findItemChat($item);
        abort_unless($chat instanceof Chat, 404);

        return $chat;
    }

    /**
     * The thread an attachment belongs to: the item's thread for a pending upload
     * (no message yet), otherwise the parent message's thread, which must be this item's.
     */
    private function chatFromAttachment(CollectionItem $item, CollectionItemChatAttachment $attachment): ?Chat
    {
        if ($attachment->message_id === null) {
            return $this->chats->findItemChat($item);
        }

        $parent = $attachment->message;
        abort_unless($parent instanceof CollectionItemChatMessage, 404);
        $chat = $parent->chat;
        abort_unless($chat instanceof Chat, 404);
        abort_unless((int) $chat->collection_item_id === (int) $item->id, 404);

        return $chat;
    }
}
