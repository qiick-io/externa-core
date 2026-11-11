<?php

namespace App\Http\Controllers\Collections;

use App\Actions\Chat\AddChatAttachmentToFieldAction;
use App\Actions\Chat\DeleteChatMessageAction;
use App\Actions\Chat\PinChatMessageAction;
use App\Actions\Chat\SendChatMessageAction;
use App\Actions\Chat\ToggleChatReactionAction;
use App\Actions\Chat\TransferChatAttachmentToFileAction;
use App\Actions\Chat\UpdateChatMessageAction;
use App\Data\Chat\SendChatMessageData;
use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\AddChatAttachmentToFieldRequest;
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
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Chat\ChatAttachmentAccessService;
use App\Services\Chat\ChatAttachmentUploadService;
use App\Services\Chat\ChatMentionService;
use App\Services\Chat\ChatMessageFeedService;
use App\Services\Chat\ChatNotificationService;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Item-form chat alias: resolve/create the item thread, then run the same
 * chat Actions and Services as the hub routes (`ChatMessageController`).
 */
class ItemChatController extends Controller
{
    public function __construct(
        private ChatService $chats,
        private ChatUnreadService $unread,
        private ChatAttachmentUploadService $chatUploads,
        private ChatAttachmentAccessService $attachmentAccess,
        private ChatMessageFeedService $feed,
        private ChatMentionService $mentionOptions,
        private ChatNotificationService $notifications,
        private CollectionPermissionEnforcerService $permissionEnforcer,
        private EffectivePermissionResolverService $permissionResolver,
    ) {}

    public function index(ListChatMessagesRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $chat = $this->chats->findItemChat($item);

        if (! $chat instanceof Chat) {
            return response()->json($this->feed->emptyPage((int) $collection->id, $user, $request->validated()));
        }

        return response()->json($this->feed->page($chat, $user, $request->validated()));
    }

    public function store(
        StoreChatMessageRequest $request,
        Collection $collection,
        CollectionItem $item,
        SendChatMessageAction $sendChatMessage,
    ): JsonResponse {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $chat = $this->chats->findOrCreateItemChat($user, $collection, $item);

        $payload = $sendChatMessage->execute(SendChatMessageData::fromValidated($chat, $user, $request->validated()));

        return response()->json(['message' => $payload], 201);
    }

    public function update(
        UpdateChatMessageRequest $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
        UpdateChatMessageAction $updateChatMessage,
    ): JsonResponse {
        $chat = $this->existingItemChat($item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();
        $payload = $updateChatMessage->execute($chat, $message, $user, (string) $validated['body'], $validated['mentioned_user_ids'] ?? null);

        return response()->json(['message' => $payload]);
    }

    public function destroy(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
        DeleteChatMessageAction $deleteChatMessage,
    ): JsonResponse {
        $chat = $this->chatForItem($request, $collection, $item);
        $this->chats->assertAccessible($request, $chat);
        abort_unless((string) $message->chat_id === (string) $chat->id, 404);

        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless((int) $message->user_id === (int) $user->id, 403);

        $deleteChatMessage->execute($chat, $message, $user);

        return response()->json(['ok' => true]);
    }

    public function pin(
        PinChatMessageRequest $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
        PinChatMessageAction $pinChatMessage,
    ): JsonResponse {
        $chat = $this->existingItemChat($item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $payload = $pinChatMessage->execute($chat, $message, $user, (bool) $request->validated()['pinned']);

        return response()->json(['message' => $payload]);
    }

    public function react(
        ReactToChatMessageRequest $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatMessage $message,
        ToggleChatReactionAction $toggleChatReaction,
    ): JsonResponse {
        $chat = $this->existingItemChat($item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return response()->json($toggleChatReaction->execute($chat, $message, $user, $request->validated()['emoji']));
    }

    public function mentions(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        $chat = $this->chats->findOrCreateItemChat($user, $collection, $item);
        $this->chats->assertAccessible($request, $chat);

        return response()->json($this->mentionOptions->options($request, $chat, trim((string) $request->query('q', ''))));
    }

    public function updateNotify(UpdateChatNotifyRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $this->notifications->setNotifyForCollection($user, (int) $collection->id, $validated['notify']);

        return response()->json(['notify' => $validated['notify']]);
    }

    public function markRead(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chats->findItemChat($item);
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        if ($chat instanceof Chat) {
            $this->chats->assertAccessible($request, $chat);
            $this->unread->markRead($chat, $user);
            $this->unread->broadcast($user, $chat);
        }

        return response()->json($this->unread->shared($user));
    }

    public function stopViewing(Request $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chats->findItemChat($item);

        if ($chat instanceof Chat) {
            $user = $request->user();
            abort_unless($user instanceof User, 401);
            $this->chats->assertAccessible($request, $chat);
            $this->unread->forgetViewer($chat, $user);
        }

        return response()->json(['ok' => true]);
    }

    public function storeAttachment(StoreChatAttachmentRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        /** @var UploadedFile $uploaded */
        $uploaded = $request->validated()['file'];
        $attachment = $this->chatUploads->storeSingle($user, $uploaded);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    public function initAttachmentUpload(InitChatAttachmentUploadRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $upload = $this->chatUploads->init(
            $user,
            $validated['file_name'],
            (int) $validated['total_size'],
            (int) $validated['total_chunks'],
            $validated['mime_type'] ?? null,
        );

        return response()->json([
            'upload_id' => $upload->upload_id,
            'expires_at' => $upload->expires_at->toIso8601String(),
        ], 201);
    }

    public function uploadAttachmentChunk(UploadChatAttachmentChunkRequest $request, Collection $collection, CollectionItem $item): Response
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();

        $this->chatUploads->uploadChunk(
            $user,
            $validated['upload_id'],
            (int) $validated['chunk_index'],
            $validated['chunk'],
        );

        return response()->noContent();
    }

    public function completeAttachmentUpload(FindChatAttachmentUploadRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $attachment = $this->chatUploads->complete($user, $request->validated()['upload_id']);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    public function attachmentUploadStatus(FindChatAttachmentUploadRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $status = $this->chatUploads->status($user, $request->validated()['upload_id']);

        if ($status === null) {
            return response()->json(['message' => 'Upload not found or expired'], 404);
        }

        return response()->json($status);
    }

    public function showAttachment(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        return $this->attachmentAccess->download($request, $chat, $attachment);
    }

    public function showAttachmentPreview(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        return $this->attachmentAccess->preview($request, $chat, $attachment);
    }

    public function destroyAttachment(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): Response {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        $this->attachmentAccess->assertCancellable($request, $chat, $attachment);
        $attachment->delete();

        return response()->noContent();
    }

    public function saveToFiles(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
        TransferChatAttachmentToFileAction $transferChatAttachmentToFile,
    ): JsonResponse {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);
        $this->attachmentAccess->assertAccessible($request, $chat, $attachment);

        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateFiles->value),
            403,
        );

        $file = $transferChatAttachmentToFile->execute($attachment);

        return response()->json([
            'attachment' => $attachment->fresh()?->toApiArray(),
            'file' => [
                'id' => $file->id,
                'name' => $file->name,
            ],
        ]);
    }

    public function addToField(
        AddChatAttachmentToFieldRequest $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
        AddChatAttachmentToFieldAction $addChatAttachmentToField,
    ): JsonResponse {
        $chat = $request->itemChat();
        $chatCollection = $chat->collection;
        $chatItem = $chat->item;
        abort_unless($chatCollection instanceof Collection && $chatItem instanceof CollectionItem, 404);

        $added = $addChatAttachmentToField->execute($request, $chatCollection, $chatItem, $attachment, $request->validated()['field']);

        return response()->json([
            'attachment' => $attachment->fresh()?->toApiArray(),
            'file' => [
                'id' => $added['file']->id,
                'name' => $added['file']->name,
            ],
            'field' => $added['field'],
            'value' => $added['value'],
        ]);
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
