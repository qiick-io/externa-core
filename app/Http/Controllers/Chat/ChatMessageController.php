<?php

namespace App\Http\Controllers\Chat;

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Events\ItemChatMessageCreated;
use App\Events\ItemChatMessageDeleted;
use App\Events\ItemChatMessageUpdated;
use App\Events\ItemChatReactionToggled;
use App\Http\Controllers\Controller;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\CollectionItemChatReaction;
use App\Models\File;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\ItemChatNotification;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Chat\ChatAttachmentUploadService;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatUnreadService;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\FileService;
use App\Services\Settings\SettingsRepository;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * JSON chat API keyed by unified Chat UUID.
 */
class ChatMessageController extends Controller
{
    private const DEFAULT_PER_PAGE = 20;

    private const MAX_PER_PAGE = 100;

    private const SETTINGS_GROUP = 'item_chat';

    private const SETTINGS_KEY = 'notify';

    public function __construct(
        private ChatService $chats,
        private ChatUnreadService $unread,
        private ChatAttachmentUploadService $chatUploads,
        private CollectionPermissionEnforcer $permissionEnforcer,
        private EffectivePermissionResolver $permissionResolver,
        private SettingsRepository $settings,
        private FileService $fileService,
        private CollectionItemValuesAssembler $assembler,
        private CollectionItemDataNormalizer $normalizer,
        private CollectionItemValuesWriter $writer,
        private CollectionLocaleResolver $localeResolver,
    ) {}

    public function index(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);

        $validated = $request->validate([
            'before_id' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $perPage = min(
            max((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE), 1),
            self::MAX_PER_PAGE,
        );
        $beforeId = isset($validated['before_id']) ? (int) $validated['before_id'] : null;

        $query = CollectionItemChatMessage::query()
            ->where('chat_id', $chat->id)
            ->with($this->messageRelations())
            ->orderByDesc('id');

        if ($beforeId !== null) {
            $query->where('id', '<', $beforeId);
        }

        $page = $query->limit($perPage + 1)->get();
        $hasMore = $page->count() > $perPage;
        $messages = $page->take($perPage)->reverse()->values();

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $pinned = CollectionItemChatMessage::query()
            ->where('chat_id', $chat->id)
            ->whereNotNull('pinned_at')
            ->with(['user:id,first_name,last_name,email'])
            ->orderByDesc('pinned_at')
            ->get();

        $collectionId = $chat->collection_id !== null ? (int) $chat->collection_id : null;

        return response()->json([
            'messages' => $messages
                ->map(fn (CollectionItemChatMessage $message): array => $this->serializeMessage($message, $user))
                ->values()
                ->all(),
            'pinned' => $pinned
                ->map(fn (CollectionItemChatMessage $message): array => $this->serializePinned($message))
                ->values()
                ->all(),
            'meta' => [
                'total' => CollectionItemChatMessage::query()->where('chat_id', $chat->id)->count(),
                'has_more' => $hasMore,
                'per_page' => $perPage,
                'notify' => $collectionId !== null ? $this->isSubscribed($user, $collectionId) : false,
                'chat_id' => $chat->id,
                'kind' => $chat->kind,
                'visibility_hint' => $chat->isItem(),
            ],
        ]);
    }

    /**
     * Empty payload used by the item alias before a thread exists.
     */
    public function emptyIndex(Request $request, Collection $collection): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'before_id' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $perPage = min(
            max((int) ($validated['per_page'] ?? self::DEFAULT_PER_PAGE), 1),
            self::MAX_PER_PAGE,
        );

        return response()->json([
            'messages' => [],
            'pinned' => [],
            'meta' => [
                'total' => 0,
                'has_more' => false,
                'per_page' => $perPage,
                'notify' => $this->isSubscribed($user, (int) $collection->id),
                'chat_id' => null,
                'kind' => Chat::KIND_ITEM,
                'visibility_hint' => true,
            ],
        ]);
    }

    public function store(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'body' => ['nullable', 'string', 'max:20000'],
            'mentioned_user_ids' => ['sometimes', 'array'],
            'mentioned_user_ids.*' => ['integer', 'exists:users,id'],
            'attachment_ids' => ['sometimes', 'array'],
            'attachment_ids.*' => ['uuid'],
            'reply_to_id' => ['nullable', 'integer', 'exists:chat_messages,id'],
        ]);

        $body = trim((string) ($validated['body'] ?? ''));
        $attachmentIds = array_values(array_unique($validated['attachment_ids'] ?? []));

        if ($body === '' && $attachmentIds === []) {
            throw ValidationException::withMessages([
                'body' => 'Message body or an attachment is required.',
            ]);
        }

        $mentionedIds = $this->validatedMentionIds($request, $chat, $validated['mentioned_user_ids'] ?? []);
        $this->assertCollectionMentions($request, $body);
        $attachments = $this->claimOrphanAttachments($user, $attachmentIds);
        $replyToId = $this->validatedReplyToId($chat, isset($validated['reply_to_id']) ? (int) $validated['reply_to_id'] : null);

        $message = CollectionItemChatMessage::query()->create([
            'chat_id' => $chat->id,
            'user_id' => $user->id,
            'body' => $body,
            'mentioned_user_ids' => $mentionedIds,
            'reply_to_id' => $replyToId,
        ]);

        foreach ($attachments as $attachment) {
            $attachment->message_id = $message->id;
            $attachment->expires_at = null;
            $attachment->save();
        }

        $chat->touch();
        $this->chats->unarchiveDirectChatForRecipients($chat, $user);

        $message->load($this->messageRelations());
        $payload = $this->serializeMessage($message, $user);

        $this->notifyRecipients($chat, $message, $user, $mentionedIds);
        $this->unread->afterMessageCreated($chat, $message, $user, $mentionedIds);
        event(new ItemChatMessageCreated($chat->id, $payload));

        activity()
            ->causedBy($user)
            ->performedOn($message)
            ->useLog('chat')
            ->event('chat_message')
            ->withProperties([
                'chat_id' => $chat->id,
                'body_preview' => Str::limit($body, 120),
                'attachment_count' => count($attachments),
                'mentioned_count' => count($mentionedIds),
                'reply_to_id' => $replyToId,
            ])
            ->log('Chat message sent');

        return response()->json(['message' => $payload], 201);
    }

    public function update(
        Request $request,
        Chat $chat,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        $this->chats->assertAccessible($request, $chat);
        $this->assertMessageOnChat($message, $chat);

        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless((int) $message->user_id === (int) $user->id, 403);

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:20000'],
            'mentioned_user_ids' => ['sometimes', 'array'],
            'mentioned_user_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $message->body = trim((string) $validated['body']);
        $this->assertCollectionMentions($request, $message->body);
        $message->mentioned_user_ids = $this->validatedMentionIds(
            $request,
            $chat,
            $validated['mentioned_user_ids'] ?? $message->mentionedIds(),
        );
        $message->save();

        $message->load($this->messageRelations());
        $payload = $this->serializeMessage($message, $user);
        event(new ItemChatMessageUpdated($chat->id, $payload));

        return response()->json(['message' => $payload]);
    }

    public function destroy(
        Request $request,
        Chat $chat,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        $this->chats->assertAccessible($request, $chat);
        $this->assertMessageOnChat($message, $chat);

        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless((int) $message->user_id === (int) $user->id, 403);

        $messageId = (int) $message->id;
        $chatId = (int) $chat->id;
        $attachmentCount = $message->attachments()->count();
        $bodyPreview = Str::limit((string) $message->body, 120);

        $message->delete();
        event(new ItemChatMessageDeleted($chat->id, $messageId));

        activity()
            ->causedBy($user)
            ->useLog('chat')
            ->event('chat_message_deleted')
            ->withProperties([
                'chat_id' => $chatId,
                'message_id' => $messageId,
                'body_preview' => $bodyPreview,
                'attachment_count' => $attachmentCount,
            ])
            ->log('Chat message deleted');

        return response()->json(['ok' => true]);
    }

    public function pin(
        Request $request,
        Chat $chat,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        $this->chats->assertAccessible($request, $chat);
        $this->assertMessageOnChat($message, $chat);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'pinned' => ['required', 'boolean'],
        ]);

        $message->pinned_at = $validated['pinned'] ? now() : null;
        $message->save();

        $message->load($this->messageRelations());
        $payload = $this->serializeMessage($message, $user);
        event(new ItemChatMessageUpdated($chat->id, $payload));

        return response()->json(['message' => $payload]);
    }

    public function react(
        Request $request,
        Chat $chat,
        CollectionItemChatMessage $message,
    ): JsonResponse {
        $this->chats->assertAccessible($request, $chat);
        $this->assertMessageOnChat($message, $chat);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'emoji' => ['required', 'string', 'max:16'],
        ]);

        $emoji = $validated['emoji'];
        if (! in_array($emoji, CollectionItemChatReaction::ALLOWED, true)) {
            throw ValidationException::withMessages([
                'emoji' => 'Unsupported reaction.',
            ]);
        }

        $existing = CollectionItemChatReaction::query()
            ->where('message_id', $message->id)
            ->where('user_id', $user->id)
            ->where('emoji', $emoji)
            ->first();

        $added = $existing === null;
        if ($existing instanceof CollectionItemChatReaction) {
            $existing->delete();
        } else {
            CollectionItemChatReaction::query()->create([
                'message_id' => $message->id,
                'user_id' => $user->id,
                'emoji' => $emoji,
            ]);
        }

        event(new ItemChatReactionToggled(
            $chat->id,
            (int) $message->id,
            (int) $user->id,
            $this->displayName($user),
            $emoji,
            $added,
        ));

        $message->load($this->messageRelations());

        return response()->json([
            'message_id' => $message->id,
            'emoji' => $emoji,
            'added' => $added,
            'reactions' => $this->serializeReactions($message, $user),
        ]);
    }

    public function mentions(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);

        if (! $this->chats->allowsMentions($chat)) {
            return response()->json([
                'users' => [],
                'collections' => [],
            ]);
        }

        $q = trim((string) $request->query('q', ''));
        $users = $this->mentionUsers($request, $chat, $q);
        $collections = $chat->isItem() ? $this->mentionCollections($request, $q) : [];

        return response()->json([
            'users' => $users,
            'collections' => $collections,
        ]);
    }

    public function updateNotify(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);
        abort_unless($chat->isItem() && $chat->collection_id !== null, 422);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'notify' => ['required', 'boolean'],
        ]);

        $ids = $this->subscribedCollectionIds($user);
        $collectionId = (int) $chat->collection_id;

        if ($validated['notify']) {
            if (! in_array($collectionId, $ids, true)) {
                $ids[] = $collectionId;
            }
        } else {
            $ids = array_values(array_filter($ids, fn (int $id): bool => $id !== $collectionId));
        }

        $this->settings->set(
            SettingsRepository::SCOPE_USER,
            self::SETTINGS_GROUP,
            self::SETTINGS_KEY,
            $ids,
            $user->id,
        );

        return response()->json(['notify' => $validated['notify']]);
    }

    public function storeAttachment(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'file' => ['required', 'file'],
        ]);

        /** @var UploadedFile $uploaded */
        $uploaded = $validated['file'];
        $attachment = $this->chatUploads->storeSingle($user, $uploaded);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    public function initAttachmentUpload(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'total_size' => ['required', 'integer', 'min:1'],
            'total_chunks' => ['required', 'integer', 'min:1'],
            'mime_type' => ['nullable', 'string', 'max:255'],
        ]);

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

    public function uploadAttachmentChunk(Request $request): Response
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'upload_id' => ['required', 'string', 'max:64'],
            'chunk_index' => ['required', 'integer', 'min:0'],
            'chunk' => ['required', 'file'],
        ]);

        $this->chatUploads->uploadChunk(
            $user,
            $validated['upload_id'],
            (int) $validated['chunk_index'],
            $validated['chunk'],
        );

        return response()->noContent();
    }

    public function completeAttachmentUpload(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'upload_id' => ['required', 'string', 'max:64'],
        ]);

        $attachment = $this->chatUploads->complete($user, $validated['upload_id']);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    public function attachmentUploadStatus(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $validated = $request->validate([
            'upload_id' => ['required', 'string', 'max:64'],
        ]);

        $status = $this->chatUploads->status($user, $validated['upload_id']);

        if ($status === null) {
            return response()->json(['message' => 'Upload not found or expired'], 404);
        }

        return response()->json($status);
    }

    public function showAttachment(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertAttachmentAccessible($request, $chat, $attachment);
        abort_if($attachment->isExpired(), 404);
        abort_unless(Storage::disk($attachment->disk)->exists($attachment->path), 404);

        return Storage::disk($attachment->disk)->response(
            $attachment->path,
            $attachment->original_name,
            [
                'Content-Type' => $attachment->mime_type,
            ],
        );
    }

    public function showAttachmentPreview(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertAttachmentAccessible($request, $chat, $attachment);
        abort_if($attachment->isExpired(), 404);
        abort_unless($attachment->hasPreview(), 404);
        abort_unless(Storage::disk($attachment->disk)->exists($attachment->preview_path), 404);

        $mime = is_string($attachment->preview_mime) && $attachment->preview_mime !== ''
            ? $attachment->preview_mime
            : 'image/jpeg';

        return Storage::disk($attachment->disk)->response(
            $attachment->preview_path,
            'preview-'.$attachment->original_name,
            [
                'Content-Type' => $mime,
            ],
        );
    }

    public function destroyAttachment(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): Response {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        // Orphan cancel only — claimed attachments stay with the message
        abort_unless($attachment->message_id === null, 403);
        abort_unless((int) $attachment->user_id === (int) $user->id, 403);

        if ($chat !== null) {
            $this->chats->assertAccessible($request, $chat);
        }

        $attachment->delete();

        return response()->noContent();
    }

    public function saveToFiles(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): JsonResponse {
        $this->assertAttachmentAccessible($request, $chat, $attachment);

        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateFiles->value),
            403,
        );

        $file = $this->transferToFilePool($attachment);

        return response()->json([
            'attachment' => $attachment->fresh()?->toApiArray(),
            'file' => [
                'id' => $file->id,
                'name' => $file->name,
            ],
        ]);
    }

    public function addToField(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): JsonResponse {
        $this->chats->assertAccessible($request, $chat);
        abort_unless($chat->isItem(), 422);
        $this->assertAttachmentAccessible($request, $chat, $attachment);

        $collection = $chat->collection;
        $item = $chat->item;
        abort_unless($collection instanceof Collection && $item instanceof CollectionItem, 404);
        $this->permissionEnforcer->assertItemWritable($request, $collection, $item);

        $validated = $request->validate([
            'field' => ['required', 'string'],
        ]);

        $collection->load(['fields' => fn ($q) => $q->ordered()]);
        $field = $collection->fields->first(
            fn (CollectionField $row): bool => $row->name === $validated['field'],
        );
        abort_unless($field instanceof CollectionField, 404);

        $allowedTypes = [FieldTypeEnum::Image, FieldTypeEnum::Files];
        abort_unless(in_array($field->type, $allowedTypes, true), 422);

        $file = $this->transferToFilePool($attachment);
        $fileId = (int) $file->id;

        $this->permissionEnforcer->assertWritableFields(
            $request,
            $collection,
            [$field->name => $field->type === FieldTypeEnum::Files ? [$fileId] : $fileId],
            'update',
        );

        $assembled = $this->assembler->assemble($item);
        $assembled[$field->name] = $this->mergedFieldValue($field, $assembled[$field->name] ?? null, $fileId);
        $normalized = $this->normalizer->normalize($collection, $assembled, false);
        $this->writer->sync($item, $collection, $normalized);

        return response()->json([
            'attachment' => $attachment->fresh()?->toApiArray(),
            'file' => [
                'id' => $file->id,
                'name' => $file->name,
            ],
            'field' => $field->name,
            'value' => $assembled[$field->name],
        ]);
    }

    public function storeAttachmentOnChat(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);

        return $this->storeAttachment($request);
    }

    public function initAttachmentUploadOnChat(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);

        return $this->initAttachmentUpload($request);
    }

    public function uploadAttachmentChunkOnChat(Request $request, Chat $chat): Response
    {
        $this->chats->assertAccessible($request, $chat);

        return $this->uploadAttachmentChunk($request);
    }

    public function completeAttachmentUploadOnChat(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);

        return $this->completeAttachmentUpload($request);
    }

    public function attachmentUploadStatusOnChat(Request $request, Chat $chat): JsonResponse
    {
        $this->chats->assertAccessible($request, $chat);

        return $this->attachmentUploadStatus($request);
    }

    public function showAttachmentOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->chats->assertAccessible($request, $chat);

        return $this->showAttachment($request, $chat, $attachment);
    }

    public function showAttachmentPreviewOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->chats->assertAccessible($request, $chat);

        return $this->showAttachmentPreview($request, $chat, $attachment);
    }

    public function destroyAttachmentOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): Response {
        return $this->destroyAttachment($request, $chat, $attachment);
    }

    public function saveToFilesOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): JsonResponse {
        $this->chats->assertAccessible($request, $chat);

        return $this->saveToFiles($request, $chat, $attachment);
    }

    private function assertMessageOnChat(CollectionItemChatMessage $message, Chat $chat): void
    {
        abort_unless((string) $message->chat_id === (string) $chat->id, 404);
    }

    private function assertAttachmentAccessible(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): void {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        if ($attachment->message_id === null) {
            abort_unless((int) $attachment->user_id === (int) $user->id, 404);

            return;
        }

        $parent = $attachment->message;
        abort_unless($parent instanceof CollectionItemChatMessage, 404);

        if ($chat instanceof Chat) {
            abort_unless((string) $parent->chat_id === (string) $chat->id, 404);
            $this->chats->assertAccessible($request, $chat);

            return;
        }

        $parentChat = $parent->chat;
        abort_unless($parentChat instanceof Chat, 404);
        $this->chats->assertAccessible($request, $parentChat);
    }

    /**
     * @param  list<mixed>  $rawIds
     * @return list<int>
     */
    private function validatedMentionIds(Request $request, Chat $chat, array $rawIds): array
    {
        $ids = array_values(array_unique(array_map('intval', $rawIds)));
        if ($ids === []) {
            return [];
        }

        if (! $this->chats->allowsMentions($chat)) {
            throw ValidationException::withMessages([
                'mentioned_user_ids' => 'Mentions are not available in one-to-one chats.',
            ]);
        }

        if ($chat->isDirect()) {
            $allowed = $this->chats->mentionableUserIds($chat);
            $denied = array_values(array_diff($ids, $allowed));
            if ($denied !== []) {
                throw ValidationException::withMessages([
                    'mentioned_user_ids' => 'Mentions in private chats are limited to participants.',
                ]);
            }

            return $ids;
        }

        $collection = $chat->collection;
        abort_unless($collection instanceof Collection, 404);

        $users = User::query()
            ->whereIn('id', $ids)
            ->where('is_active', true)
            ->get();

        $allowed = [];
        foreach ($users as $candidate) {
            if ($this->chats->userCanReadCollection($candidate, $collection)) {
                $allowed[] = (int) $candidate->id;
            }
        }

        $denied = array_values(array_diff($ids, $allowed));
        if ($denied !== []) {
            throw ValidationException::withMessages([
                'mentioned_user_ids' => 'One or more mentioned users cannot read this collection.',
            ]);
        }

        return $allowed;
    }

    private function assertCollectionMentions(Request $request, string $body): void
    {
        if (! preg_match_all('/@\[collection:(\d+)\]/', $body, $matches)) {
            return;
        }

        $ids = array_values(array_unique(array_map('intval', $matches[1])));
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $found = Collection::query()->whereIn('id', $ids)->get()->keyBy('id');
        foreach ($ids as $id) {
            $collection = $found->get($id);
            if (! $collection instanceof Collection || ! $this->chats->userCanReadCollection($user, $collection)) {
                throw ValidationException::withMessages([
                    'body' => 'One or more mentioned collections are invalid.',
                ]);
            }
        }
    }

    /**
     * @param  list<string>  $ids
     * @return list<CollectionItemChatAttachment>
     */
    private function claimOrphanAttachments(User $user, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $attachments = CollectionItemChatAttachment::query()
            ->whereIn('id', $ids)
            ->where('user_id', $user->id)
            ->whereNull('message_id')
            ->get();

        if ($attachments->count() !== count($ids)) {
            throw ValidationException::withMessages([
                'attachment_ids' => 'One or more attachments are invalid.',
            ]);
        }

        foreach ($attachments as $attachment) {
            if ($attachment->isExpired()) {
                throw ValidationException::withMessages([
                    'attachment_ids' => 'One or more attachments have expired.',
                ]);
            }
        }

        return $attachments->all();
    }

    /**
     * @return list<array{id: int, name: string, email: string}>
     */
    private function mentionUsers(Request $request, Chat $chat, string $q): array
    {
        $query = User::query()->where('is_active', true);

        if ($chat->isDirect()) {
            $ids = $this->chats->mentionableUserIds($chat);
            $query->whereIn('id', $ids === [] ? [0] : $ids);
        }

        $users = $query
            ->when($q !== '', function ($inner) use ($q): void {
                $like = '%'.$q.'%';
                $inner->where(function ($nested) use ($like): void {
                    $nested->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('email', 'like', $like);
                });
            })
            ->orderBy('first_name')
            ->limit(40)
            ->get(['id', 'first_name', 'last_name', 'email', 'is_active']);

        if ($chat->isItem()) {
            $collection = $chat->collection;
            abort_unless($collection instanceof Collection, 404);
            $users = $users->filter(
                fn (User $candidate): bool => $this->chats->userCanReadCollection($candidate, $collection),
            );
        }

        return $users
            ->take(20)
            ->map(fn (User $candidate): array => [
                'id' => $candidate->id,
                'name' => $this->displayName($candidate),
                'email' => $candidate->email,
            ])
            ->values()
            ->all();
    }

    /**
     * @return list<array{id: int, name: string}>
     */
    private function mentionCollections(Request $request, string $q): array
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $collections = Collection::query()
            ->when($q !== '', fn ($query) => $query->where('name', 'like', '%'.$q.'%'))
            ->orderBy('name')
            ->limit(40)
            ->get(['id', 'name']);

        return $collections
            ->filter(fn (Collection $collection): bool => $this->chats->userCanReadCollection($user, $collection))
            ->take(20)
            ->map(fn (Collection $collection): array => [
                'id' => (int) $collection->id,
                'name' => $collection->name,
            ])
            ->values()
            ->all();
    }

    /**
     * @param  list<int>  $mentionedIds
     */
    private function notifyRecipients(
        Chat $chat,
        CollectionItemChatMessage $comment,
        User $author,
        array $mentionedIds,
    ): void {
        $subscriberIds = [];
        if ($chat->isItem() && $chat->collection_id !== null) {
            $collectionId = (int) $chat->collection_id;
            $subscriberIds = Setting::query()
                ->where('scope', SettingsRepository::SCOPE_USER)
                ->where('group', self::SETTINGS_GROUP)
                ->where('key', self::SETTINGS_KEY)
                ->whereNotNull('scope_id')
                ->get(['scope_id', 'value'])
                ->filter(function (Setting $row) use ($collectionId): bool {
                    $ids = is_array($row->value) ? array_map('intval', $row->value) : [];

                    return in_array($collectionId, $ids, true);
                })
                ->map(fn (Setting $row): int => (int) $row->scope_id)
                ->all();
        }

        $recipientIds = array_values(array_unique(array_filter(
            array_merge($mentionedIds, $subscriberIds),
            fn (int $id): bool => $id !== (int) $author->id,
        )));

        if ($recipientIds === []) {
            return;
        }

        $excerpt = Str::limit(trim(preg_replace('/@\[(?:user|collection):\d+\]/', '', $comment->body) ?? ''), 180);
        $authorName = $this->displayName($author);
        $mentionedSet = array_fill_keys($mentionedIds, true);

        $recipients = User::query()
            ->whereIn('id', $recipientIds)
            ->where('is_active', true)
            ->get();

        foreach ($recipients as $recipient) {
            $recipient->notify(new ItemChatNotification(
                chatId: $chat->id,
                collectionId: $chat->collection_id !== null ? (int) $chat->collection_id : null,
                itemId: $chat->collection_item_id !== null ? (int) $chat->collection_item_id : null,
                messageId: (int) $comment->id,
                authorName: $authorName,
                excerpt: $excerpt !== '' ? $excerpt : 'New message',
                mentioned: isset($mentionedSet[(int) $recipient->id]),
            ));
        }
    }

    /**
     * @return list<string>
     */
    private function messageRelations(): array
    {
        return [
            'user:id,first_name,last_name,email',
            'attachments',
            'reactions.user:id,first_name,last_name,email',
            'replyTo.user:id,first_name,last_name,email',
        ];
    }

    private function validatedReplyToId(Chat $chat, ?int $replyToId): ?int
    {
        if ($replyToId === null) {
            return null;
        }

        $target = CollectionItemChatMessage::query()->find($replyToId);
        abort_unless($target instanceof CollectionItemChatMessage, 404);
        abort_unless((string) $target->chat_id === (string) $chat->id, 422);

        return (int) $target->id;
    }

    /**
     * @return array<string, mixed>
     */
    private function serializePinned(CollectionItemChatMessage $message): array
    {
        $author = $message->user;
        $mentions = $this->serializeMentions($message);

        return [
            'id' => $message->id,
            'body' => trim($message->body),
            'user' => $author ? [
                'id' => $author->id,
                'name' => $this->displayName($author),
            ] : null,
            'mentioned_users' => $mentions['mentioned_users'],
            'mentioned_collections' => $mentions['mentioned_collections'],
        ];
    }

    /**
     * @return array{mentioned_users: list<array{id: int, name: string}>, mentioned_collections: list<array{id: int, name: string}>}
     */
    private function serializeMentions(CollectionItemChatMessage $comment): array
    {
        $mentionedIds = $comment->mentionedIds();
        $mentionedUsers = $mentionedIds === []
            ? collect()
            : User::query()->whereIn('id', $mentionedIds)->get(['id', 'first_name', 'last_name', 'email']);

        preg_match_all('/@\[collection:(\d+)\]/', $comment->body, $collectionMatches);
        $collectionIds = array_values(array_unique(array_map('intval', $collectionMatches[1] ?? [])));
        $mentionedCollections = $collectionIds === []
            ? collect()
            : Collection::query()->whereIn('id', $collectionIds)->get(['id', 'name']);

        return [
            'mentioned_users' => $mentionedUsers
                ->map(fn (User $user): array => [
                    'id' => $user->id,
                    'name' => $this->displayName($user),
                ])
                ->values()
                ->all(),
            'mentioned_collections' => $mentionedCollections
                ->map(fn (Collection $collection): array => [
                    'id' => (int) $collection->id,
                    'name' => $collection->name,
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * @return list<array{emoji: string, count: int, reacted: bool, users: list<array{id: int, name: string}>}>
     */
    private function serializeReactions(CollectionItemChatMessage $message, User $viewer): array
    {
        $grouped = $message->reactions->groupBy('emoji');
        $out = [];

        foreach ($grouped as $emoji => $rows) {
            $users = $rows
                ->map(function (CollectionItemChatReaction $reaction): ?array {
                    $author = $reaction->user;
                    if (! $author instanceof User) {
                        return null;
                    }

                    return [
                        'id' => (int) $author->id,
                        'name' => $this->displayName($author),
                    ];
                })
                ->filter()
                ->values()
                ->all();

            $out[] = [
                'emoji' => (string) $emoji,
                'count' => count($users),
                'reacted' => $rows->contains(
                    fn (CollectionItemChatReaction $reaction): bool => (int) $reaction->user_id === (int) $viewer->id,
                ),
                'users' => $users,
            ];
        }

        return $out;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function serializeReplyTo(CollectionItemChatMessage $message): ?array
    {
        $replyTo = $message->replyTo;
        if (! $replyTo instanceof CollectionItemChatMessage) {
            return null;
        }

        $author = $replyTo->user;

        return [
            'id' => $replyTo->id,
            'body' => Str::limit(trim($replyTo->body), 120),
            'user' => $author ? [
                'id' => $author->id,
                'name' => $this->displayName($author),
            ] : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeMessage(CollectionItemChatMessage $comment, User $viewer): array
    {
        $author = $comment->user;
        $mentionedIds = $comment->mentionedIds();
        $mentions = $this->serializeMentions($comment);

        $isAuthor = $author !== null && (int) $author->id === (int) $viewer->id;

        return [
            'id' => $comment->id,
            'body' => $comment->body,
            'mentioned_user_ids' => $mentionedIds,
            'mentioned_users' => $mentions['mentioned_users'],
            'mentioned_collections' => $mentions['mentioned_collections'],
            'user' => $author ? [
                'id' => $author->id,
                'name' => $this->displayName($author),
            ] : null,
            'attachments' => $comment->attachments
                ->map(fn (CollectionItemChatAttachment $attachment): array => $attachment->toApiArray())
                ->values()
                ->all(),
            'reply_to' => $this->serializeReplyTo($comment),
            'is_pinned' => $comment->isPinned(),
            'pinned_at' => $comment->pinned_at?->toIso8601String(),
            'reactions' => $this->serializeReactions($comment, $viewer),
            'created_at' => $comment->created_at?->toIso8601String(),
            'updated_at' => $comment->updated_at?->toIso8601String(),
            'can_edit' => $isAuthor,
            'can_delete' => $isAuthor,
        ];
    }

    private function displayName(User $user): string
    {
        $name = trim($user->name);

        return $name !== '' ? $name : $user->email;
    }

    /**
     * @return list<int>
     */
    private function subscribedCollectionIds(User $user): array
    {
        $value = $this->settings->get(
            SettingsRepository::SCOPE_USER,
            self::SETTINGS_GROUP,
            self::SETTINGS_KEY,
            $user->id,
            [],
        );

        if (! is_array($value)) {
            return [];
        }

        return array_values(array_unique(array_map('intval', $value)));
    }

    private function isSubscribed(User $user, int $collectionId): bool
    {
        return in_array($collectionId, $this->subscribedCollectionIds($user), true);
    }

    public function isUserSubscribed(User $user, int $collectionId): bool
    {
        return $this->isSubscribed($user, $collectionId);
    }

    public function setNotifyForCollection(User $user, int $collectionId, bool $notify): void
    {
        $ids = $this->subscribedCollectionIds($user);

        if ($notify) {
            if (! in_array($collectionId, $ids, true)) {
                $ids[] = $collectionId;
            }
        } else {
            $ids = array_values(array_filter($ids, fn (int $id): bool => $id !== $collectionId));
        }

        $this->settings->set(
            SettingsRepository::SCOPE_USER,
            self::SETTINGS_GROUP,
            self::SETTINGS_KEY,
            $ids,
            $user->id,
        );
    }

    private function transferToFilePool(CollectionItemChatAttachment $attachment): File
    {
        if ($attachment->transferred_file_id !== null) {
            $existing = $attachment->transferredFile;
            abort_unless($existing instanceof File, 404);

            return $existing;
        }

        abort_if($attachment->isExpired(), 404);
        abort_unless(Storage::disk($attachment->disk)->exists($attachment->path), 404);

        $uploaded = new UploadedFile(
            $attachment->absolutePath(),
            $attachment->original_name,
            $attachment->mime_type,
            null,
            true,
        );

        $file = $this->fileService->uploadFile($uploaded);
        $attachment->transferred_file_id = $file->id;
        $attachment->save();

        return $file;
    }

    /**
     * Merge a file id into an image/file/files field value (append for files).
     */
    private function mergedFieldValue(CollectionField $field, mixed $current, int $fileId): mixed
    {
        $locale = $this->localeResolver->resolve();

        if ($field->translatable) {
            $map = is_array($current) ? $current : [];
            $map[$locale] = $this->mergeScalarOrList($field, $map[$locale] ?? null, $fileId);

            return $map;
        }

        return $this->mergeScalarOrList($field, $current, $fileId);
    }

    private function mergeScalarOrList(CollectionField $field, mixed $current, int $fileId): mixed
    {
        if (! $field->usesArrayStorage()) {
            return $fileId;
        }

        $list = is_array($current) ? array_map('intval', $current) : [];
        if (! in_array($fileId, $list, true)) {
            $list[] = $fileId;
        }

        return array_values($list);
    }
}
