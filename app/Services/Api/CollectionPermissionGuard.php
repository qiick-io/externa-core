<?php

namespace App\Services\Api;

use App\Enums\CollectionPermissionAction;
use App\Models\CollectionPermission;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Support\Facades\Cache;

/**
 * Resolves per-collection CRUD access and rules for a role. Absence of a grant = deny.
 */
class CollectionPermissionGuard
{
    private const CACHE_TTL_SECONDS = 300;

    public function __construct(
        private CollectionPermissionRules $rulesService,
    ) {}

    public function allows(int $roleId, int $collectionId, CollectionPermissionAction|string $action): bool
    {
        $actionValue = $action instanceof CollectionPermissionAction ? $action->value : $action;
        $matrix = $this->matrixForRole($roleId);

        return (bool) ($matrix[$collectionId][$actionValue] ?? false);
    }

    /**
     * Normalized rules for a role×collection grant, or null when no grant / unrestricted null rules.
     *
     * @return array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}|null
     */
    public function rulesFor(int $roleId, int $collectionId): ?array
    {
        $bundle = $this->bundleForRole($roleId);
        if (! isset($bundle['matrix'][$collectionId])) {
            return null;
        }

        $raw = $bundle['rules'][$collectionId] ?? null;

        return $this->rulesService->normalize(is_array($raw) ? $raw : null);
    }

    /**
     * @return array<int, array<string, bool>>
     */
    public function matrixForRole(int $roleId): array
    {
        return $this->bundleForRole($roleId)['matrix'];
    }

    /**
     * Effective rules for an admin user across their roles (OR merge).
     *
     * Returns null when the user has no collection_permissions grants for the collection
     * (Spatie-only admin access → unrestricted fields/items).
     *
     * @return array{fields: array<string, array{read: bool, create: bool, update: bool}>, item_filter: ?array}|null
     */
    public function rulesForUser(?User $user, int $collectionId): ?array
    {
        if ($user === null) {
            return null;
        }

        if (app(EffectivePermissionResolver::class)->isSuperAdmin($user)) {
            return $this->rulesService->normalize(null);
        }

        $roleIds = $user->roles()->pluck('id')->map(fn ($id) => (int) $id)->all();
        if ($roleIds === []) {
            return null;
        }

        $sets = [];
        $hasGrant = false;

        foreach ($roleIds as $roleId) {
            $bundle = $this->bundleForRole($roleId);
            if (! isset($bundle['matrix'][$collectionId])) {
                continue;
            }

            $hasGrant = true;
            $raw = $bundle['rules'][$collectionId] ?? null;
            $sets[] = $this->rulesService->normalize(is_array($raw) ? $raw : null);
        }

        if (! $hasGrant) {
            return null;
        }

        return $this->rulesService->merge($sets);
    }

    public function forget(int $roleId): void
    {
        Cache::forget($this->cacheKey($roleId));
    }

    /**
     * @return array{matrix: array<int, array<string, bool>>, rules: array<int, array<string, mixed>|null>}
     */
    private function bundleForRole(int $roleId): array
    {
        return Cache::remember(
            $this->cacheKey($roleId),
            self::CACHE_TTL_SECONDS,
            function () use ($roleId): array {
                $rows = CollectionPermission::query()
                    ->where('role_id', $roleId)
                    ->where('allowed', true)
                    ->get(['collection_id', 'action', 'rules']);

                $matrix = [];
                $rules = [];

                foreach ($rows as $row) {
                    $collectionId = (int) $row->collection_id;
                    $action = $row->action instanceof CollectionPermissionAction
                        ? $row->action->value
                        : (string) $row->action;
                    $matrix[$collectionId][$action] = true;

                    // Prefer the richest non-null rules blob for the collection
                    if (! isset($rules[$collectionId]) && is_array($row->rules)) {
                        $rules[$collectionId] = $row->rules;
                    } elseif (is_array($row->rules) && ($rules[$collectionId] ?? null) === null) {
                        $rules[$collectionId] = $row->rules;
                    } elseif (is_array($row->rules) && empty($rules[$collectionId])) {
                        $rules[$collectionId] = $row->rules;
                    }
                }

                return [
                    'matrix' => $matrix,
                    'rules' => $rules,
                ];
            }
        );
    }

    private function cacheKey(int $roleId): string
    {
        return 'collection_permissions.role.v2.'.$roleId;
    }
}
