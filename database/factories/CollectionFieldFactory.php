<?php

namespace Database\Factories;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CollectionField>
 */
class CollectionFieldFactory extends Factory
{
    protected $model = CollectionField::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'collection_id' => Collection::factory(),
            'name' => fake()->unique()->regexify('[a-z]{3,12}'),
            'type' => FieldTypeEnum::String,
            'translatable' => false,
            'settings' => null,
            'sort_order' => 0,
        ];
    }
}
