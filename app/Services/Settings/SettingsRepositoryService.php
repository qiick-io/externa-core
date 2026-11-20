<?php

declare(strict_types=1);

namespace App\Services\Settings;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Thin get/set store for project- and user-scoped settings.
 *
 * Reads and writes go through `scope_ref` (`''` for instance / null scope_id). `scope_id` is
 * dual-written for one release so older readers still work (#827 step 4).
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
            ->where('scope_ref', SettingsScopeRefService::scopeRefFromScopeId($scopeId))
            ->where('group', $group)
            ->where('key', $key)
            ->first();

        return $row?->value ?? $default;
    }

    /**
     * Persist a single setting value.
     *
     * Side effects: dual-writes `scope_id` alongside `scope_ref` for this release.
     */
    public function set(string $scope, string $group, string $key, mixed $value, ?int $scopeId = null): void
    {
        Setting::query()->updateOrCreate(
            [
                'scope' => $scope,
                'scope_ref' => SettingsScopeRefService::scopeRefFromScopeId($scopeId),
                'group' => $group,
                'key' => $key,
            ],
            [
                'scope_id' => $scopeId,
                'value' => $value,
            ],
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
                    [
                        'scope' => $scope,
                        'scope_ref' => SettingsScopeRefService::scopeRefFromScopeId($scopeId),
                        'group' => $group,
                        'key' => $key,
                    ],
                    [
                        'scope_id' => $scopeId,
                        'value' => $value,
                    ],
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
        $stored = Setting::query()
            ->where('scope', self::SCOPE_PROJECT)
            ->where('scope_ref', self::SCOPE_REF_INSTANCE)
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
        $stored = Setting::query()
            ->where('scope', self::SCOPE_USER)
            ->where('scope_ref', (string) $user->id)
            ->where('group', $group)
            ->pluck('value', 'key')
            ->all();

        return array_merge($defaults, $stored);
    }
}
