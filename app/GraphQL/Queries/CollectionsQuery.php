<?php

namespace App\GraphQL\Queries;

use App\Enums\CollectionPermissionAction;
use App\Models\Collection;
use App\Services\Api\CollectionPermissionGuard;
use App\Support\Api\ApiAccess;

final class CollectionsQuery
{
    /**
     * @return list<array<string, mixed>>
     */
    public function __invoke(mixed $_, array $args): array
    {
        $access = app(ApiAccess::class);
        $matrix = app(CollectionPermissionGuard::class)->matrixForRole($access->roleId());

        return Collection::query()
            ->active()
            ->ordered()
            ->get(['id', 'name', 'slug', 'is_singleton'])
            ->filter(fn (Collection $c): bool => (bool) ($matrix[(int) $c->id][CollectionPermissionAction::Read->value] ?? false))
            ->map(fn (Collection $c): array => [
                'id' => $c->id,
                'name' => $c->name,
                'slug' => $c->slug,
                'is_singleton' => (bool) $c->is_singleton,
            ])
            ->values()
            ->all();
    }
}
