<?php

namespace App\GraphQL\Queries;

use App\Data\Api\ApiAccessData;
use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Services\Api\CollectionPermissionGuardService;
use Illuminate\Support\Facades\Gate;

final class CollectionsQuery
{
    /**
     * @return list<array<string, mixed>>
     */
    public function __invoke(mixed $_, array $args): array
    {
        $access = app(ApiAccessData::class);
        $matrix = app(CollectionPermissionGuardService::class)->matrixForRole($access->roleId());
        $gate = Gate::forUser(request()->user());

        return Collection::query()
            ->active()
            ->ordered()
            ->get(['id', 'name', 'slug', 'is_singleton'])
            ->filter(fn (Collection $c): bool => (bool) ($matrix[(int) $c->id][CollectionPermissionActionEnum::Read->value] ?? false))
            ->filter(fn (Collection $c): bool => $gate->allows('viewItems', $c))
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
