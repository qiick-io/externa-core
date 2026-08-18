<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Chat\ChatHubController;
use App\Http\Controllers\Chat\ChatMessageController;
use App\Http\Controllers\Controller;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Item-form chat alias: resolve/create the item thread, then reuse ChatMessageController.
 */
class ItemChatController extends Controller
{
    public function __construct(
        private ChatMessageController $messages,
        private ChatHubController $hub,
        private ChatService $chats,
        private ChatUnreadService $unread,
        private CollectionPermissionEnforcer $permissionEnforcer,
    ) {}

    public function index(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chats->findItemChat($item);

        if (! $chat instanceof Chat) {
            return $this->messages->emptyIndex($request, $collection);
        }

        return $this->messages->index($request, $chat);
    }

    public function store(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $chat = $this->chats->findOrCreateItemChat($user, $collection, $item);

        return $this->messages->store($request, $chat);
    }

    public function update(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        return $this->messages->update($request, $this->chatForItem($request, $collection, $item), $message);
    }

    public function destroy(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        return $this->messages->destroy($request, $this->chatForItem($request, $collection, $item), $message);
    }

    public function pin(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        return $this->messages->pin($request, $this->chatForItem($request, $collection, $item), $message);
    }

    public function react(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        return $this->messages->react($request, $this->chatForItem($request, $collection, $item), $message);
    }

    public function forward(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        return $this->messages->forward($request, $this->chatForItem($request, $collection, $item), $message);
    }

    public function mentions(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $chat = $this->chats->findOrCreateItemChat($user, $collection, $item);

        return $this->messages->mentions($request, $chat);
    }

    public function updateNotify(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'notify' => ['required', 'boolean'],
        ]);

        $this->messages->setNotifyForCollection($user, (int) $collection->id, $validated['notify']);

        return response()->json(['notify' => $validated['notify']]);
    }

    public function markRead(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chats->findItemChat($item);

        if (! $chat instanceof Chat) {
            $user = $request->user();
            abort_unless($user instanceof User, 401);

            return response()->json($this->unread->shared($user));
        }

        return $this->hub->markRead($request, $chat);
    }

    public function storeAttachment(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);

        return $this->messages->storeAttachment($request);
    }

    public function showAttachment(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        return $this->messages->showAttachment($request, $chat, $attachment);
    }

    public function saveToFiles(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): JsonResponse {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        return $this->messages->saveToFiles($request, $chat, $attachment);
    }

    public function addToField(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): JsonResponse {
        $chat = $this->chatForItem($request, $collection, $item);

        return $this->messages->addToField($request, $chat, $attachment);
    }

    private function assertItemContext(Request $request, Collection $collection, CollectionItem $item): void
    {
        abort_unless((int) $item->collection_id === (int) $collection->id, 404);
        $this->permissionEnforcer->assertItemReadable($request, $collection, $item);
    }

    private function chatForItem(Request $request, Collection $collection, CollectionItem $item): Chat
    {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chats->findItemChat($item);
        abort_unless($chat instanceof Chat, 404);

        return $chat;
    }

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
