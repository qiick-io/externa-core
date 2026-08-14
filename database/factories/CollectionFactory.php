<?php

namespace Database\Factories;

use App\Enums\CollectionStatusEnum;
use App\Models\Collection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Collection>
 */
class CollectionFactory extends Factory
{
    protected $model = Collection::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->words(2, true);

        return [
            'name' => Str::title($name),
            'slug' => Str::slug((string) $name).'-'.fake()->unique()->numberBetween(1, 999999),
            'description' => null,
            'status' => CollectionStatusEnum::Active,
            'icon' => null,
            'color' => null,
            'is_singleton' => false,
            'versioning' => false,
            'revision_retention_count' => null,
            'revision_retention_days' => null,
            'sort_order' => 0,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => [
            'status' => CollectionStatusEnum::Inactive,
        ]);
    }
}
