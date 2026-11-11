<?php

declare(strict_types=1);

namespace App\Services\Chat;

use App\Models\Chat;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Support\Http\UserContentResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Who may see or cancel a chat attachment, and the download / preview
 * responses. An unclaimed attachment belongs to its uploader alone; a claimed
 * one is visible to whoever can access the thread of its message.
 */
class ChatAttachmentAccessService
{
    public function __construct(
        private ChatService $chats,
    ) {}

    /**
     * Abort 404 unless the current user may see the attachment: the uploader
     * for an unclaimed one, a thread member for a claimed one. When `$chat`
     * is given, the attachment's message must belong to it.
     */
    public function assertAccessible(
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

    public function download(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertAccessible($request, $chat, $attachment);
        abort_if($attachment->isExpired(), 404);
        abort_unless(Storage::disk($attachment->disk)->exists($attachment->path), 404);

        return UserContentResponse::fromDisk(
            Storage::disk($attachment->disk),
            $attachment->path,
            (string) $attachment->original_name,
            $attachment->mime_type,
        );
    }

    public function preview(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertAccessible($request, $chat, $attachment);
        abort_if($attachment->isExpired(), 404);
        abort_unless($attachment->hasPreview(), 404);
        abort_unless(Storage::disk($attachment->disk)->exists($attachment->preview_path), 404);

        $mime = is_string($attachment->preview_mime) && $attachment->preview_mime !== ''
            ? $attachment->preview_mime
            : 'image/jpeg';

        return UserContentResponse::fromDisk(
            Storage::disk($attachment->disk),
            $attachment->preview_path,
            'preview-'.$attachment->original_name,
            $mime,
        );
    }

    /**
     * Only the uploader may cancel an attachment, and only before a message
     * claims it: claimed attachments stay with the message (403).
     */
    public function assertCancellable(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): void {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        abort_unless($attachment->message_id === null, 403);
        abort_unless((int) $attachment->user_id === (int) $user->id, 403);

        if ($chat !== null) {
            $this->chats->assertAccessible($request, $chat);
        }
    }
}
