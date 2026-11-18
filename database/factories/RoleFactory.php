<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Assignable, non-system role on the default guard, as admins create them in the UI.
 *
 * @extends Factory<Role>
 */
class RoleFactory extends Factory
{
    protected $model = Role::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => 'role-'.fake()->unique()->numberBetween(1, 999999),
            'guard_name' => config('auth.defaults.guard', 'web'),
            'is_system' => false,
            'is_assignable' => true,
        ];
    }

    /** A locked system role (admin, editor, …) that the UI cannot rename or delete. */
    public function system(): static
    {
        return $this->state(fn (): array => [
            'is_system' => true,
        ]);
    }
}
