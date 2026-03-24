<?php

namespace Database\Factories;

use App\Models\ContentCollection;
use App\Models\Item;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Item>
 */
class ItemFactory extends Factory
{
    protected $model = Item::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'collection_id' => ContentCollection::factory(),
            'data' => [],
        ];
    }
}
