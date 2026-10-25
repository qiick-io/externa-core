<?php

namespace App\Services\Api;

use App\Enums\CollectionPermissionAction;
use App\Models\Collection;
use App\Models\CollectionPermission;
use App\Models\Role;
use Illuminate\Support\Facades\DB;

/**
 * Sync role × collection CRUD grants and optional field/item_filter rules.
 */
class CollectionPermissionSync
{
    public function __construct(
        private CollectionPermissionGuard $guard,
        private CollectionPermissionRules $rulesService,
    ) {}

    /**
     * @param  array<int|string, array<string, mixed>>  $matrix  collection_id => [action => bool, rules? => array]
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

                $normalizedRules = $this->rulesService->normalize(
                    isset($actions['rules']) && is_array($actions['rules']) ? $actions['rules'] : null,
                );
                $rulesJson = ($normalizedRules['fields'] === [] && $normalizedRules['item_filter'] === null)
                    ? null
                    : json_encode($normalizedRules);

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
                        'rules' => $rulesJson,
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
     * @return array<int, array<string, mixed>>
     */
    public function matrixForRole(Role $role): array
    {
        $collections = Collection::query()->orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'slug']);
        $grants = CollectionPermission::query()
            ->where('role_id', $role->id)
            ->where('allowed', true)
            ->get(['collection_id', 'action', 'rules']);

        $allowed = [];
        $rulesByCollection = [];
        foreach ($grants as $grant) {
            $action = $grant->action instanceof CollectionPermissionAction
                ? $grant->action->value
                : (string) $grant->action;
            $cid = (int) $grant->collection_id;
            $allowed[$cid][$action] = true;
            if (is_array($grant->rules) && ! isset($rulesByCollection[$cid])) {
                $rulesByCollection[$cid] = $this->rulesService->normalize($grant->rules);
            }
        }

        $matrix = [];
        foreach ($collections as $collection) {
            $id = (int) $collection->id;
            $matrix[$id] = [
                'create' => (bool) ($allowed[$id]['create'] ?? false),
                'read' => (bool) ($allowed[$id]['read'] ?? false),
                'update' => (bool) ($allowed[$id]['update'] ?? false),
                'delete' => (bool) ($allowed[$id]['delete'] ?? false),
                'rules' => $rulesByCollection[$id] ?? [
                    'fields' => [],
                    'item_filter' => null,
                ],
            ];
        }

        return $matrix;
    }

    /**
     * @return list<array{id: int, name: string, slug: string, fields: list<array{name: string, type: string}>}>
     */
    public function collectionsPayload(): array
    {
        return Collection::query()
            ->with(['fields' => fn ($q) => $q->ordered()->select(['id', 'collection_id', 'name', 'type'])])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'slug'])
            ->map(fn (Collection $collection): array => [
                'id' => $collection->id,
                'name' => $collection->name,
                'slug' => $collection->slug,
                'fields' => $collection->fields
                    ->map(fn ($field): array => [
                        'name' => $field->name,
                        'type' => $field->type?->value ?? (string) $field->type,
                    ])
                    ->values()
                    ->all(),
            ])
            ->values()
            ->all();
    }
}
