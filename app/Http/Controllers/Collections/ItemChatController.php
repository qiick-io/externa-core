<?php

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Chat\ChatHubController;
use App\Http\Controllers\Chat\ChatMessageController;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\FindChatAttachmentUploadRequest;
use App\Http\Requests\Chat\InitChatAttachmentUploadRequest;
use App\Http\Requests\Chat\ListChatMessagesRequest;
use App\Http\Requests\Chat\PinChatMessageRequest;
use App\Http\Requests\Chat\ReactToChatMessageRequest;
use App\Http\Requests\Chat\StoreChatAttachmentRequest;
use App\Http\Requests\Chat\StoreChatMessageRequest;
use App\Http\Requests\Chat\UpdateChatMessageRequest;
use App\Http\Requests\Chat\UpdateChatNotifyRequest;
use App\Http\Requests\Chat\UploadChatAttachmentChunkRequest;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
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
        private CollectionPermissionEnforcerService $permissionEnforcer,
    ) {}

    public function index(ListChatMessagesRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $chat = $this->chats->findItemChat($item);

        if (! $chat instanceof Chat) {
            return $this->messages->emptyIndex($request, $collection);
        }

        return $this->messages->index($request, $chat);
    }

    public function store(StoreChatMessageRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $chat = $this->chats->findOrCreateItemChat($user, $collection, $item);

        return $this->messages->store($request, $chat);
    }

    public function update(
        UpdateChatMessageRequest $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        return $this->messages->update($request, $this->existingItemChat($item), $message);
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
        PinChatMessageRequest $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        return $this->messages->pin($request, $this->existingItemChat($item), $message);
    }

    public function react(
        ReactToChatMessageRequest $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        return $this->messages->react($request, $this->existingItemChat($item), $message);
    }

    public function mentions(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $chat = $this->chats->findOrCreateItemChat($user, $collection, $item);

        return $this->messages->mentions($request, $chat);
    }

    public function updateNotify(UpdateChatNotifyRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

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

    public function stopViewing(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chats->findItemChat($item);

        if (! $chat instanceof Chat) {
            return response()->json(['ok' => true]);
        }

        return $this->hub->stopViewing($request, $chat);
    }

    public function storeAttachment(StoreChatAttachmentRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        return $this->messages->storeAttachment($request);
    }

    public function initAttachmentUpload(InitChatAttachmentUploadRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        return $this->messages->initAttachmentUpload($request);
    }

    public function uploadAttachmentChunk(UploadChatAttachmentChunkRequest $request, Collection $collection, CollectionItem $item): Response
    {
        return $this->messages->uploadAttachmentChunk($request);
    }

    public function completeAttachmentUpload(FindChatAttachmentUploadRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        return $this->messages->completeAttachmentUpload($request);
    }

    public function attachmentUploadStatus(FindChatAttachmentUploadRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        return $this->messages->attachmentUploadStatus($request);
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

    public function showAttachmentPreview(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        return $this->messages->showAttachmentPreview($request, $chat, $attachment);
    }

    public function destroyAttachment(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): Response {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        return $this->messages->destroyAttachment($request, $chat, $attachment);
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
