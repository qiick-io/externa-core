<?php

declare(strict_types=1);

namespace App\Services\Chat;

use App\Models\Collection;
use App\Models\CollectionItemChatAttachment;
use App\Models\CollectionItemChatMessage;
use App\Models\CollectionItemChatReaction;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * The JSON shape of chat messages, pinned messages and reactions, shared by
 * the hub routes, the item-form alias and the realtime events, so every
 * surface sends the same payload.
 */
class ChatMessageSerializerService
{
    /**
     * Relations a serialized message reads; eager-load them before serializing.
     *
     * @return list<string>
     */
    public function messageRelations(): array
    {
        return [
            'user:id,first_name,last_name,email',
            'user.roles:id,name',
            'attachments',
            'reactions.user:id,first_name,last_name,email',
            'replyTo.user:id,first_name,last_name,email',
            'replyTo.user.roles:id,name',
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
            'user' => $author ? $this->serializeChatUser($author) : null,
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

    /**
     * @return array<string, mixed>
     */
    public function serializePinned(CollectionItemChatMessage $message): array
    {
        $author = $message->user;
        $mentions = $this->serializeMentions($message);

        return [
            'id' => $message->id,
            'body' => trim($message->body),
            'user' => $author ? $this->serializeChatUser($author) : null,
            'mentioned_users' => $mentions['mentioned_users'],
            'mentioned_collections' => $mentions['mentioned_collections'],
        ];
    }

    /**
     * @return list<array{emoji: string, count: int, reacted: bool, users: list<array{id: int, name: string}>}>
     */
    public function serializeReactions(CollectionItemChatMessage $message, User $viewer): array
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
     * The name chat shows for a user, falling back to the email when the
     * profile has no name.
     */
    public function displayName(User $user): string
    {
        $name = trim($user->name);

        return $name !== '' ? $name : $user->email;
    }

    /**
     * @return array{mentioned_users: list<array{id: int, name: string, role: string|null}>, mentioned_collections: list<array{id: int, name: string}>}
     */
    private function serializeMentions(CollectionItemChatMessage $comment): array
    {
        $mentionedIds = $comment->mentionedIds();
        $mentionedUsers = $mentionedIds === []
            ? collect()
            : User::query()->whereIn('id', $mentionedIds)->with('roles:id,name')
                ->get(['id', 'first_name', 'last_name', 'email']);

        preg_match_all('/@\[collection:(\d+)\]/', $comment->body, $collectionMatches);
        $collectionIds = array_values(array_unique(array_map('intval', $collectionMatches[1] ?? [])));
        $mentionedCollections = $collectionIds === []
            ? collect()
            : Collection::query()->whereIn('id', $collectionIds)->get(['id', 'name']);

        return [
            'mentioned_users' => $mentionedUsers
                ->map(fn (User $user): array => $this->serializeChatUser($user))
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
            'user' => $author ? $this->serializeChatUser($author) : null,
        ];
    }

    /**
     * A chat participant as the thread shows them: name and role, for the
     * user hover card on author names and mentions.
     *
     * @return array{id: int, name: string, role: string|null}
     */
    private function serializeChatUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $this->displayName($user),
            'role' => $user->getRoleNames()->first(),
        ];
    }
}
