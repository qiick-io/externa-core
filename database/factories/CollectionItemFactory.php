<?php

namespace Database\Factories;

use App\Models\Collection;
use App\Models\CollectionItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CollectionItem>
 */
class CollectionItemFactory extends Factory
{
    protected $model = CollectionItem::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'collection_id' => Collection::factory(),
        ];
    }
}
