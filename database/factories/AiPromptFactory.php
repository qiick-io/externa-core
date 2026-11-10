<?php

namespace Database\Factories;

use App\Models\AiPrompt;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AiPrompt>
 */
class AiPromptFactory extends Factory
{
    protected $model = AiPrompt::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->words(3, true),
            'description' => fake()->optional()->sentence(),
            'body' => fake()->paragraph(),
            'created_by' => User::factory(),
            'updated_by' => null,
        ];
    }
}
