<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Chat;
use App\Models\CollectionItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Item chat thread on a fresh collection item (one thread per item, unique in the schema).
 * Participants are not created: item chats derive access from the item's permissions.
 *
 * @extends Factory<Chat>
 */
class ChatFactory extends Factory
{
    protected $model = Chat::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'kind' => Chat::KIND_ITEM,
            'collection_item_id' => CollectionItem::factory(),
            'collection_id' => fn (array $attributes): int => (int) CollectionItem::query()
                ->whereKey($attributes['collection_item_id'])
                ->value('collection_id'),
            'created_by_user_id' => User::factory(),
        ];
    }

    /** A private direct thread, not tied to an item; add `ChatParticipant` rows for its members. */
    public function direct(): static
    {
        return $this->state(fn (): array => [
            'kind' => Chat::KIND_DIRECT,
            'collection_id' => null,
            'collection_item_id' => null,
        ]);
    }

    public function forItem(CollectionItem $item): static
    {
        return $this->state(fn (): array => [
            'kind' => Chat::KIND_ITEM,
            'collection_id' => $item->collection_id,
            'collection_item_id' => $item->id,
        ]);
    }
}
