<?php

namespace Database\Factories;

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
            'is_singleton' => false,
            'sort_order' => 0,
        ];
    }
}
