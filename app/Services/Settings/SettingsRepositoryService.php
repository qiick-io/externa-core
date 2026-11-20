<?php

declare(strict_types=1);

namespace App\Services\Settings;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Thin get/set store for project- and user-scoped settings.
 *
 * Reads and writes go through `scope_ref` when the column exists (`''` for instance / null
 * scope_id). During the deploy window, before migrate finishes, queries fall back to
 * `scope_id` so mid-upgrade traffic still works (#827 step 4). `scope_id` is dual-written
 * for one release so older readers still work.
 */
class SettingsRepositoryService
{
    public const SCOPE_PROJECT = 'project';

    public const SCOPE_USER = 'user';

    /** Empty string sentinel for instance / project-wide scope (NOT NULL; see #827). */
    public const SCOPE_REF_INSTANCE = '';

    public function __construct(
        private SettingsScopeRefService $scopeRefService,
    ) {}

    /**
     * Read a single setting value.
     */
    public function get(string $scope, string $group, string $key, ?int $scopeId = null, mixed $default = null): mixed
    {
        $row = $this->scopedQuery($scope, $scopeId)
            ->where('group', $group)
            ->where('key', $key)
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
        $attributes = [
            'scope' => $scope,
            'group' => $group,
            'key' => $key,
        ];
        $values = [
            'scope_id' => $scopeId,
            'value' => $value,
        ];

        if ($this->scopeRefService->hasScopeRefColumn()) {
            $attributes['scope_ref'] = SettingsScopeRefService::scopeRefFromScopeId($scopeId);
        } else {
            $attributes['scope_id'] = $scopeId;
        }

        Setting::query()->updateOrCreate($attributes, $values);

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
                $this->set($scope, $group, $key, $value, $scopeId);
            }
        });
    }

    /**
     * All stored keys for the project scope and group, merged with defaults.
     *
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    public function project(string $group, array $defaults = []): array
    {
        $stored = $this->scopedQuery(self::SCOPE_PROJECT, null)
            ->where('group', $group)
            ->pluck('value', 'key')
            ->all();

        return array_merge($defaults, $stored);
    }

    /**
     * All stored keys for a user and group, merged with defaults.
     *
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    public function forUser(User $user, string $group, array $defaults = []): array
    {
        $stored = $this->scopedQuery(self::SCOPE_USER, (int) $user->id)
            ->where('group', $group)
            ->pluck('value', 'key')
            ->all();

        return array_merge($defaults, $stored);
    }

    /**
     * @return Builder<Setting>
     */
    private function scopedQuery(string $scope, ?int $scopeId): Builder
    {
        $query = Setting::query()->where('scope', $scope);

        if ($this->scopeRefService->hasScopeRefColumn()) {
            return $query->where('scope_ref', SettingsScopeRefService::scopeRefFromScopeId($scopeId));
        }

        if ($scopeId === null) {
            return $query->whereNull('scope_id');
        }

        return $query->where('scope_id', $scopeId);
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
}
