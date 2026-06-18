<?php

namespace App\Support\Authorization;

use Illuminate\Support\Collection;
use Spatie\Permission\Models\Permission;

class PermissionGrouper
{
    /**
     * @return list<array{
     *     section: string,
     *     label: string,
     *     show_permission: array{id: int, name: string}|null,
     *     child_permissions: list<array{id: int, name: string}>
     * }>
     */
    public function group(Collection $permissions): array
    {
        $sorted = $permissions->sortBy('name')->values();

        /** @var array<string, array{section: string, label: string, show_permission: array{id: int, name: string}|null, child_permissions: list<array{id: int, name: string}>}> $groupMap */
        $groupMap = [];
        $groups = [];

        foreach ($sorted as $permission) {
            if (! str_starts_with($permission->name, 'can-show-')) {
                continue;
            }

            $section = substr($permission->name, strlen('can-show-'));

            $group = [
                'section' => $section,
                'label' => $this->sectionLabel($section),
                'show_permission' => $this->permissionPayload($permission),
                'child_permissions' => [],
            ];

            $groupMap[$section] = $group;
            $groups[] = $section;
        }

        foreach ($sorted as $permission) {
            if (str_starts_with($permission->name, 'can-show-')) {
                continue;
            }

            if (! preg_match('/^can-(create|edit|delete|restore|force-delete)-(.+)$/', $permission->name, $matches)) {
                continue;
            }

            $resource = $matches[2];
            $section = $this->matchSection($resource, $groupMap);

            if ($section === null) {
                continue;
            }

            $groupMap[$section]['child_permissions'][] = $this->permissionPayload($permission);
        }

        return array_values(array_filter(
            array_map(fn (string $section): array => $groupMap[$section], $groups),
            fn (array $group): bool => $group['show_permission'] !== null,
        ));
    }

    /**
     * @param  array<string, array{section: string, label: string, show_permission: array{id: int, name: string}|null, child_permissions: list<array{id: int, name: string}>}>  $groupMap
     */
    private function matchSection(string $resource, array $groupMap): ?string
    {
        if (isset($groupMap[$resource])) {
            return $resource;
        }

        $plural = $resource.'s';

        if (isset($groupMap[$plural])) {
            return $plural;
        }

        if (str_ends_with($resource, 'y')) {
            $pluralIes = substr($resource, 0, -1).'ies';

            if (isset($groupMap[$pluralIes])) {
                return $pluralIes;
            }
        }

        return null;
    }

    /**
     * @return array{id: int, name: string}
     */
    private function permissionPayload(Permission $permission): array
    {
        return [
            'id' => $permission->id,
            'name' => $permission->name,
        ];
    }

    private function sectionLabel(string $section): string
    {
        return match ($section) {
            'users' => 'Users',
            'groups' => 'Groups',
            'roles' => 'Roles',
            'permissions' => 'Permissions',
            'files' => 'Files',
            'collections' => 'Collections',
            default => ucfirst(str_replace('-', ' ', $section)),
        };
    }
}
