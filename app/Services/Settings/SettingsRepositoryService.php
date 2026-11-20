<?php

declare(strict_types=1);

namespace App\Services\Settings;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Thin get/set store for project- and user-scoped settings.
 *
 * Reads and writes go through `scope_ref` (`''` for instance / null scope_id) once that column
 * exists. `scope_id` is dual-written for one release. While an upgrade is mid-migrate (OIDC
 * import before the scope_ref migration in the same batch), lookups fall back to `scope_id`
 * so earlier migrations in the batch still work (#827 step 4).
 */
class SettingsRepositoryService
{
    public const SCOPE_PROJECT = 'project';

    public const SCOPE_USER = 'user';

    /** Empty string sentinel for instance / project-wide scope (NOT NULL; see #827). */
    public const SCOPE_REF_INSTANCE = '';

    /**
     * Read a single setting value.
     */
    public function get(string $scope, string $group, string $key, ?int $scopeId = null, mixed $default = null): mixed
    {
        $row = Setting::query()
            ->where('scope', $scope)
            ->where('group', $group)
            ->where('key', $key)
            ->when(
                $this->usesScopeRef(),
                fn ($query) => $query->where('scope_ref', SettingsScopeRefService::scopeRefFromScopeId($scopeId)),
                fn ($query) => $query->when(
                    $scopeId === null,
                    fn ($inner) => $inner->whereNull('scope_id'),
                    fn ($inner) => $inner->where('scope_id', $scopeId),
                ),
            )
            ->first();

        return $row?->value ?? $default;
    }

    /**
     * Persist a single setting value.
     *
     * Side effects: dual-writes `scope_id` alongside `scope_ref` when the column exists.
     */
    public function set(string $scope, string $group, string $key, mixed $value, ?int $scopeId = null): void
    {
        Setting::query()->updateOrCreate(
            $this->identityAttributes($scope, $group, $key, $scopeId),
            $this->writeAttributes($scopeId, $value),
        );

        $this->forgetProjectSettingsMemo($scope, $group);
    }

    /**
     * Persist many keys for a scope/group in one transaction.
     *
     * @param  array<string, mixed>  $values
     */
    public function setMany(string $scope, string $group, array $values, ?int $scopeId = null): void
    {
        DB::transaction(function () use ($scope, $group, $values, $scopeId): void {
            foreach ($values as $key => $value) {
                Setting::query()->updateOrCreate(
                    $this->identityAttributes($scope, $group, $key, $scopeId),
                    $this->writeAttributes($scopeId, $value),
                );
            }
        });

        $this->forgetProjectSettingsMemo($scope, $group);
    }

    private function forgetProjectSettingsMemo(string $scope, string $group): void
    {
        if ($scope !== self::SCOPE_PROJECT || $group !== 'project') {
            return;
        }

        if (! app()->bound(ProjectSettingsService::class)) {
            return;
        }

        app(ProjectSettingsService::class)->forgetRawCache();
    }

    /**
     * All stored keys for the project scope and group, merged with defaults.
     *
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    public function project(string $group, array $defaults = []): array
    {
        $query = Setting::query()
            ->where('scope', self::SCOPE_PROJECT)
            ->where('group', $group);

        if ($this->usesScopeRef()) {
            $query->where('scope_ref', self::SCOPE_REF_INSTANCE);
        } else {
            $query->whereNull('scope_id');
        }

        return array_merge($defaults, $query->pluck('value', 'key')->all());
    }

    /**
     * All stored keys for a user and group, merged with defaults.
     *
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    public function forUser(User $user, string $group, array $defaults = []): array
    {
        $query = Setting::query()
            ->where('scope', self::SCOPE_USER)
            ->where('group', $group);

        if ($this->usesScopeRef()) {
            $query->where('scope_ref', (string) $user->id);
        } else {
            $query->where('scope_id', $user->id);
        }

        return array_merge($defaults, $query->pluck('value', 'key')->all());
    }

    /**
     * @return array{scope: string, group: string, key: string, scope_ref?: string, scope_id?: int|null}
     */
    private function identityAttributes(string $scope, string $group, string $key, ?int $scopeId): array
    {
        $attributes = [
            'scope' => $scope,
            'group' => $group,
            'key' => $key,
        ];

        if ($this->usesScopeRef()) {
            $attributes['scope_ref'] = SettingsScopeRefService::scopeRefFromScopeId($scopeId);
        } else {
            $attributes['scope_id'] = $scopeId;
        }

        return $attributes;
    }

    /**
     * @return array{scope_id: int|null, value: mixed, scope_ref?: string}
     */
    private function writeAttributes(?int $scopeId, mixed $value): array
    {
        $attributes = [
            'scope_id' => $scopeId,
            'value' => $value,
        ];

        if ($this->usesScopeRef()) {
            $attributes['scope_ref'] = SettingsScopeRefService::scopeRefFromScopeId($scopeId);
        }

        return $attributes;
    }

    private function usesScopeRef(): bool
    {
        return Schema::hasColumn('settings', 'scope_ref');
    }
}
