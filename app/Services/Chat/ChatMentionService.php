<?php

declare(strict_types=1);

namespace App\Services\Chat;

use App\Models\Chat;
use App\Models\Collection;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Chat mentions: the users and collections a message may mention (and the
 * autocomplete that offers them), so a mention never points at someone who
 * cannot read the thread.
 */
class ChatMentionService
{
    public function __construct(
        private ChatService $chats,
        private ChatMessageSerializerService $serializer,
    ) {}

    /**
     * The mentioned user ids a message may keep: participants on private
     * chats, users who can read the collection on item chats.
     *
     * @param  list<mixed>  $rawIds
     * @return list<int>
     *
     * @throws ValidationException When the chat allows no mentions or a user is not allowed
     */
    public function validatedMentionIds(Chat $chat, array $rawIds): array
    {
        $ids = array_values(array_unique(array_map('intval', $rawIds)));
        if ($ids === []) {
            return [];
        }

        if (! $this->chats->allowsMentions($chat)) {
            throw ValidationException::withMessages([
                'mentioned_user_ids' => __('Mentions are not available in one-to-one chats.'),
            ]);
        }

        if ($chat->isDirect()) {
            $allowed = $this->chats->mentionableUserIds($chat);
            $denied = array_values(array_diff($ids, $allowed));
            if ($denied !== []) {
                throw ValidationException::withMessages([
                    'mentioned_user_ids' => __('Mentions in private chats are limited to participants.'),
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
            if ($this->chats->canUserReadCollection($candidate, $collection)) {
                $allowed[] = (int) $candidate->id;
            }
        }

        $denied = array_values(array_diff($ids, $allowed));
        if ($denied !== []) {
            throw ValidationException::withMessages([
                'mentioned_user_ids' => __('One or more mentioned users cannot read this collection.'),
            ]);
        }

        return $allowed;
    }

    /**
     * Every `@[collection:<id>]` token in the body must name a collection the
     * author can read.
     *
     * @throws ValidationException
     */
    public function assertCollectionMentions(User $author, string $body): void
    {
        if (! preg_match_all('/@\[collection:(\d+)\]/', $body, $matches)) {
            return;
        }

        $ids = array_values(array_unique(array_map('intval', $matches[1])));

        $found = Collection::query()->whereIn('id', $ids)->get()->keyBy('id');
        foreach ($ids as $id) {
            $collection = $found->get($id);
            if (! $collection instanceof Collection || ! $this->chats->canUserReadCollection($author, $collection)) {
                throw ValidationException::withMessages([
                    'body' => __('One or more mentioned collections are invalid.'),
                ]);
            }
        }
    }

    /**
     * Mention autocomplete for the thread: matching users, plus readable
     * collections on item chats. Empty when the chat allows no mentions.
     *
     * @return array{users: list<array{id: int, name: string, email: string}>, collections: list<array{id: int, name: string}>}
     */
    public function options(Request $request, Chat $chat, string $search): array
    {
        if (! $this->chats->allowsMentions($chat)) {
            return [
                'users' => [],
                'collections' => [],
            ];
        }

        return [
            'users' => $this->mentionUsers($chat, $search),
            'collections' => $chat->isItem() ? $this->mentionCollections($request, $search) : [],
        ];
    }

    /**
     * @return list<array{id: int, name: string, email: string}>
     */
    private function mentionUsers(Chat $chat, string $q): array
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
                fn (User $candidate): bool => $this->chats->canUserReadCollection($candidate, $collection),
            );
        }

        return $users
            ->take(20)
            ->map(fn (User $candidate): array => [
                'id' => $candidate->id,
                'name' => $this->serializer->displayName($candidate),
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
            ->filter(fn (Collection $collection): bool => $this->chats->canUserReadCollection($user, $collection))
            ->take(20)
            ->map(fn (Collection $collection): array => [
                'id' => (int) $collection->id,
                'name' => $collection->name,
            ])
            ->values()
            ->all();
    }
}
