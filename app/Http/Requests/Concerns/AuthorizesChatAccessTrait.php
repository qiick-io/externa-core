<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Chat\ChatService;

/**
 * Chat access checks for chat form requests.
 *
 * Chat endpoints are reached two ways: the hub routes (`chat/{chat}/...`) and
 * the item-form alias (`collections/{collection}/items/{item}/chat/...`), which
 * resolves the item's thread and then reuses the hub controller actions. Both
 * checked access before validating the payload, so these checks run in
 * `authorize()`: a user without access keeps getting 401 / 403 / 404, never a
 * 422 that would reveal the payload shape of a thread they cannot see.
 */
trait AuthorizesChatAccessTrait
{
    /**
     * Assert access to the `{chat}` route parameter when the route has one.
     *
     * @return Chat|null The chat when the route has one, null otherwise
     */
    protected function authorizeRouteChat(): ?Chat
    {
        $chat = $this->route('chat');

        if (! $chat instanceof Chat) {
            return null;
        }

        app(ChatService::class)->assertAccessible($this, $chat);

        return $chat;
    }

    /**
     * Assert the item-form alias context (the item belongs to the collection
     * and is readable) when the route has `{collection}` and `{item}`.
     *
     * @return bool Whether the route is an item-form alias route
     */
    protected function authorizeItemContext(): bool
    {
        $collection = $this->route('collection');
        $item = $this->route('item');

        if (! $collection instanceof Collection || ! $item instanceof CollectionItem) {
            return false;
        }

        abort_unless((int) $item->collection_id === (int) $collection->id, 404);
        app(CollectionPermissionEnforcerService::class)->assertItemReadable($this, $collection, $item);

        return true;
    }

    /**
     * Attachment uploads belong to the uploader until a message claims them,
     * so they only need the route's own context: the `{chat}` thread, or the
     * item on an item-form alias route (the item's thread is not looked up).
     */
    protected function authorizeAttachmentUploadContext(): void
    {
        if ($this->authorizeRouteChat() === null) {
            $this->authorizeItemContext();
        }
    }

    /**
     * The thread the request targets: the `{chat}` route parameter, or the
     * item's existing thread on an item-form alias route. Access is asserted
     * on whichever is found; null when an item has no thread yet.
     */
    protected function authorizeChatOrItemThread(): ?Chat
    {
        $chat = $this->authorizeRouteChat();

        if ($chat instanceof Chat || ! $this->authorizeItemContext()) {
            return $chat;
        }

        $item = $this->route('item');
        $itemChat = $item instanceof CollectionItem ? app(ChatService::class)->findItemChat($item) : null;

        if ($itemChat instanceof Chat) {
            app(ChatService::class)->assertAccessible($this, $itemChat);
        }

        return $itemChat;
    }

    /**
     * Assert that the `{message}` route parameter belongs to an accessible
     * thread (404 when the item alias has no thread or the message is on
     * another one) and, for edits, that the current user wrote it (403).
     */
    protected function authorizeChatMessage(bool $mustBeAuthor): void
    {
        $chat = $this->authorizeChatOrItemThread();
        abort_unless($chat instanceof Chat, 404);

        $message = $this->route('message');
        abort_unless($message instanceof CollectionItemChatMessage, 404);
        abort_unless((string) $message->chat_id === (string) $chat->id, 404);

        if (! $mustBeAuthor) {
            return;
        }

        $user = $this->user();
        abort_unless($user instanceof User, 401);
        abort_unless((int) $message->user_id === (int) $user->id, 403);
    }
}
