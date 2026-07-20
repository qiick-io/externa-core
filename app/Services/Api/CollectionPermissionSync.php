<?php

namespace App\Services\Api;

use App\Enums\CollectionPermissionAction;
use App\Models\Collection;
use App\Models\CollectionPermission;
use App\Models\Role;
use Illuminate\Support\Facades\DB;

/**
 * Sync role × collection CRUD grants from a matrix payload.
 */
class CollectionPermissionSync
{
    public function __construct(
        private CollectionPermissionGuard $guard,
    ) {}

    /**
     * @param  array<int|string, array<string, bool>>  $matrix  collection_id => [action => allowed]
     */
    public function sync(Role $role, array $matrix): void
    {
        $validCollectionIds = Collection::query()->pluck('id')->map(fn ($id) => (int) $id)->all();
        $validActions = CollectionPermissionAction::values();

        DB::transaction(function () use ($role, $matrix, $validCollectionIds, $validActions): void {
            CollectionPermission::query()->where('role_id', $role->id)->delete();

            $rows = [];
            $now = now();

            foreach ($matrix as $collectionId => $actions) {
                $collectionId = (int) $collectionId;
                if (! in_array($collectionId, $validCollectionIds, true) || ! is_array($actions)) {
                    continue;
                }

                foreach ($validActions as $action) {
                    // Inertia/JSON may send true, 1, or "1"
                    if (! filter_var($actions[$action] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                        continue;
                    }

                    $rows[] = [
                        'role_id' => $role->id,
                        'collection_id' => $collectionId,
                        'action' => $action,
                        'allowed' => true,
                        'rules' => null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }

            if ($rows !== []) {
                CollectionPermission::query()->insert($rows);
            }
        });

        $this->guard->forget((int) $role->id);

        activity()
            ->performedOn($role)
            ->event('collection_permissions_synced')
            ->log('Collection API permissions updated');
    }

    /**
     * @return array<int, array<string, bool>>
     */
    public function matrixForRole(Role $role): array
    {
        $collections = Collection::query()->orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'slug']);
        $grants = CollectionPermission::query()
            ->where('role_id', $role->id)
            ->where('allowed', true)
            ->get(['collection_id', 'action']);

        $allowed = [];
        foreach ($grants as $grant) {
            $action = $grant->action instanceof CollectionPermissionAction
                ? $grant->action->value
                : (string) $grant->action;
            $allowed[(int) $grant->collection_id][$action] = true;
        }

        $matrix = [];
        foreach ($collections as $collection) {
            $id = (int) $collection->id;
            $matrix[$id] = [
                'create' => (bool) ($allowed[$id]['create'] ?? false),
                'read' => (bool) ($allowed[$id]['read'] ?? false),
                'update' => (bool) ($allowed[$id]['update'] ?? false),
                'delete' => (bool) ($allowed[$id]['delete'] ?? false),
            ];
        }

        return $matrix;
    }

    /**
     * @return list<array{id: int, name: string, slug: string}>
     */
    public function collectionsPayload(): array
    {
        return Collection::query()
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'slug'])
            ->map(fn (Collection $collection): array => [
                'id' => $collection->id,
                'name' => $collection->name,
                'slug' => $collection->slug,
            ])
            ->values()
            ->all();
    }
}
