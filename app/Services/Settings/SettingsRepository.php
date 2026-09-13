<?php

namespace App\Services\Settings;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Thin get/set store for project- and user-scoped settings.
 */
class SettingsRepository
{
    public const SCOPE_PROJECT = 'project';

    public const SCOPE_USER = 'user';

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
                $scopeId === null,
                fn ($query) => $query->whereNull('scope_id'),
                fn ($query) => $query->where('scope_id', $scopeId),
            )
            ->first();

        return $row?->value ?? $default;
    }

    /**
     * Persist a single setting value.
     */
    public function set(string $scope, string $group, string $key, mixed $value, ?int $scopeId = null): void
    {
        Setting::query()->updateOrCreate(
            [
                'scope' => $scope,
                'scope_id' => $scopeId,
                'group' => $group,
                'key' => $key,
            ],
            [
                'value' => $value,
            ],
        );
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
        $stored = Setting::query()
            ->where('scope', self::SCOPE_PROJECT)
            ->whereNull('scope_id')
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
            ->where('scope_id', $user->id)
            ->where('group', $group)
            ->pluck('value', 'key')
            ->all();

        return array_merge($defaults, $stored);
    }
}
