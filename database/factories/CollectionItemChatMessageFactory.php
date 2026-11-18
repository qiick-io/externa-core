<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Chat;
use App\Models\CollectionItemChatMessage;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Plain message on a chat thread, without mentions, reply or pin.
 *
 * @extends Factory<CollectionItemChatMessage>
 */
class CollectionItemChatMessageFactory extends Factory
{
    protected $model = CollectionItemChatMessage::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'chat_id' => Chat::factory(),
            'user_id' => User::factory(),
            'body' => fake()->sentence(),
            'mentioned_user_ids' => [],
        ];
    }

    public function pinned(): static
    {
        return $this->state(fn (): array => [
            'pinned_at' => now(),
        ]);
    }
}
