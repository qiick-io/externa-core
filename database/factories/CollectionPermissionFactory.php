<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Models\CollectionPermission;
use App\Models\Role;
use App\Services\Api\CollectionPermissionGuardService;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Allowed read grant of a role on a collection, without field or filter rules. Callers that
 * read the permission cache afterwards must forget it ({@see CollectionPermissionGuardService::forget()}).
 *
 * @extends Factory<CollectionPermission>
 */
class CollectionPermissionFactory extends Factory
{
    protected $model = CollectionPermission::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'role_id' => Role::factory(),
            'collection_id' => Collection::factory(),
            'action' => CollectionPermissionActionEnum::Read,
            'allowed' => true,
            'rules' => null,
        ];
    }

    public function action(CollectionPermissionActionEnum $action): static
    {
        return $this->state(fn (): array => [
            'action' => $action,
        ]);
    }

    public function denied(): static
    {
        return $this->state(fn (): array => [
            'allowed' => false,
        ]);
    }
}
