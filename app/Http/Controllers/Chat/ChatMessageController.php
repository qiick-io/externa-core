<?php

namespace App\Http\Controllers\Chat;

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
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Chat\ChatAttachmentAccessService;
use App\Services\Chat\ChatAttachmentUploadService;
use App\Services\Chat\ChatMentionService;
use App\Services\Chat\ChatMessageFeedService;
use App\Services\Chat\ChatNotificationService;
use App\Services\Chat\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * JSON chat API keyed by unified Chat UUID.
 */
class ChatMessageController extends Controller
{
    public function __construct(
        private ChatService $chats,
        private ChatAttachmentUploadService $chatUploads,
        private ChatAttachmentAccessService $attachmentAccess,
        private ChatMessageFeedService $feed,
        private ChatMentionService $mentionOptions,
        private ChatNotificationService $notifications,
        private EffectivePermissionResolverService $permissionResolver,
    ) {}

    public function index(ListChatMessagesRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return response()->json($this->feed->page($chat, $user, $request->validated()));
    }

    public function store(StoreChatMessageRequest $request, Chat $chat, SendChatMessageAction $sendChatMessage): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $payload = $sendChatMessage->execute(SendChatMessageData::fromValidated($chat, $user, $request->validated()));

        return response()->json(['message' => $payload], 201);
    }

    public function update(
        UpdateChatMessageRequest $request,
        Chat $chat,
        CollectionItemChatMessage $message,
        UpdateChatMessageAction $updateChatMessage,
    ): JsonResponse {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();
        $payload = $updateChatMessage->execute($chat, $message, $user, (string) $validated['body'], $validated['mentioned_user_ids'] ?? null);

        return response()->json(['message' => $payload]);
    }

    public function destroy(
        Request $request,
        Chat $chat,
        CollectionItemChatMessage $message,
        DeleteChatMessageAction $deleteChatMessage,
    ): JsonResponse {
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
        Chat $chat,
        CollectionItemChatMessage $message,
        PinChatMessageAction $pinChatMessage,
    ): JsonResponse {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $payload = $pinChatMessage->execute($chat, $message, $user, (bool) $request->validated()['pinned']);

        return response()->json(['message' => $payload]);
    }

    public function react(
        ReactToChatMessageRequest $request,
        Chat $chat,
        CollectionItemChatMessage $message,
        ToggleChatReactionAction $toggleChatReaction,
    ): JsonResponse {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return response()->json($toggleChatReaction->execute($chat, $message, $user, $request->validated()['emoji']));
    }

    public function mentions(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);

        return response()->json($this->mentionOptions->options($request, $chat, trim((string) $request->query('q', ''))));
    }

    public function updateNotify(UpdateChatNotifyRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validated();
        $this->notifications->setNotifyForCollection($user, (int) $chat->collection_id, (bool) $validated['notify']);

        return response()->json(['notify' => $validated['notify']]);
    }

    public function addToField(
        AddChatAttachmentToFieldRequest $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
        AddChatAttachmentToFieldAction $addChatAttachmentToField,
    ): JsonResponse {
        $collection = $chat->collection;
        $item = $chat->item;
        abort_unless($collection instanceof Collection && $item instanceof CollectionItem, 404);

        $added = $addChatAttachmentToField->execute($request, $collection, $item, $attachment, $request->validated()['field']);

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

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function storeAttachmentOnChat(StoreChatAttachmentRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        /** @var UploadedFile $uploaded */
        $uploaded = $request->validated()['file'];
        $attachment = $this->chatUploads->storeSingle($user, $uploaded);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function initAttachmentUploadOnChat(InitChatAttachmentUploadRequest $request, Chat $chat): JsonResponse
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

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function uploadAttachmentChunkOnChat(UploadChatAttachmentChunkRequest $request, Chat $chat): Response
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

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function completeAttachmentUploadOnChat(FindChatAttachmentUploadRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $attachment = $this->chatUploads->complete($user, $request->validated()['upload_id']);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function attachmentUploadStatusOnChat(FindChatAttachmentUploadRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $status = $this->chatUploads->status($user, $request->validated()['upload_id']);

        if ($status === null) {
            return response()->json(['message' => 'Upload not found or expired'], 404);
        }

        return response()->json($status);
    }

    public function showAttachmentOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->chats->assertAccessible($request, $chat);

        return $this->attachmentAccess->download($request, $chat, $attachment);
    }

    public function showAttachmentPreviewOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->chats->assertAccessible($request, $chat);

        return $this->attachmentAccess->preview($request, $chat, $attachment);
    }

    public function destroyAttachmentOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): Response {
        $this->attachmentAccess->assertCancellable($request, $chat, $attachment);
        $attachment->delete();

        return response()->noContent();
    }

    public function saveToFilesOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
        TransferChatAttachmentToFileAction $transferChatAttachmentToFile,
    ): JsonResponse {
        $this->chats->assertAccessible($request, $chat);
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
}
