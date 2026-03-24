<?php

namespace Database\Factories;

use App\Enums\FieldType;
use App\Models\ContentCollection;
use App\Models\Field;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Field>
 */
class FieldFactory extends Factory
{
    protected $model = Field::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'collection_id' => ContentCollection::factory(),
            'name' => fake()->unique()->regexify('[a-z]{3,12}'),
            'type' => FieldType::String,
            'translatable' => false,
            'settings' => null,
            'sort_order' => 0,
        ];
    }
}
