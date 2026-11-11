<?php

declare(strict_types=1);

namespace App\Services\Chat;

use App\Models\Chat;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use App\Policies\CollectionItemChatAttachmentPolicy;
use App\Support\Http\UserContentResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
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
     * Abort unless the current user may see the attachment
     * ({@see CollectionItemChatAttachmentPolicy::view()}): 404 for someone
     * else's unclaimed upload, the thread's answer for a claimed one. When
     * `$chat` is given, a claimed attachment's message must belong to it (404).
     */
    public function assertAccessible(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): void {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        // A claimed attachment reached through a thread route must sit on that thread.
        if ($attachment->message_id !== null && $chat instanceof Chat) {
            $parent = $attachment->message;
            abort_unless($parent instanceof CollectionItemChatMessage, 404);
            abort_unless((string) $parent->chat_id === (string) $chat->id, 404);
        }

        $decision = Gate::forUser($user)->inspect('view', $attachment);
        abort_if($decision->denied(), $decision->status() ?? 403);
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
     * claims it ({@see CollectionItemChatAttachmentPolicy::delete()}): claimed
     * attachments stay with the message (403).
     */
    public function assertCancellable(
        Request $request,
        ?Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): void {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        abort_unless(Gate::forUser($user)->allows('delete', $attachment), 403);

        if ($chat !== null) {
            $this->chats->assertAccessible($request, $chat);
        }
    }
}
