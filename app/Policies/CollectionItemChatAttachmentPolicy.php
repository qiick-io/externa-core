<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Chat;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Chat attachment access.
 *
 * An attachment belongs to its uploader until a message claims it; after that it follows the
 * message's thread ({@see ChatPolicy::view()}). Only an unclaimed upload can be deleted, and only
 * by its uploader: a claimed attachment stays with its message.
 */
final class CollectionItemChatAttachmentPolicy
{
    /**
     * Someone else's unclaimed upload is answered as not found; a claimed one answers like its thread.
     */
    public function view(?User $user, CollectionItemChatAttachment $attachment): Response
    {
        if ($attachment->message_id === null) {
            return $this->isUploader($user, $attachment) ? Response::allow() : Response::denyAsNotFound();
        }

        $message = $attachment->message;
        if (! $message instanceof CollectionItemChatMessage) {
            return Response::denyAsNotFound();
        }

        $chat = $message->chat;
        if (! $chat instanceof Chat) {
            return Response::denyAsNotFound();
        }

        return Gate::forUser($user)->inspect('view', $chat);
    }

    public function delete(?User $user, CollectionItemChatAttachment $attachment): bool
    {
        return $attachment->message_id === null && $this->isUploader($user, $attachment);
    }

    private function isUploader(?User $user, CollectionItemChatAttachment $attachment): bool
    {
        return $user instanceof User && (int) $attachment->user_id === (int) $user->id;
    }
}
