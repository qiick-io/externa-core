<?php

namespace App\Services\Api;

use App\Enums\FilePermissionAction;
use App\Models\FilePermission;
use App\Models\Role;
use Illuminate\Support\Facades\DB;

/**
 * Sync role × file CRUD grants from a flat action map.
 */
class FilePermissionSync
{
    public function __construct(
        private FilePermissionGuard $guard,
    ) {}

    /**
     * @param  array<string, bool>  $grants  action => allowed
     */
    public function sync(Role $role, array $grants): void
    {
        $validActions = FilePermissionAction::values();

        DB::transaction(function () use ($role, $grants, $validActions): void {
            FilePermission::query()->where('role_id', $role->id)->delete();

            $rows = [];
            $now = now();

            foreach ($validActions as $action) {
                // Inertia/JSON may send true, 1, or "1"
                if (! filter_var($grants[$action] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                    continue;
                }

                $rows[] = [
                    'role_id' => $role->id,
                    'action' => $action,
                    'allowed' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            if ($rows !== []) {
                FilePermission::query()->insert($rows);
            }
        });

        $this->guard->forget((int) $role->id);

        activity()
            ->performedOn($role)
            ->event('file_permissions_synced')
            ->log('File API permissions updated');
    }

    /**
     * @return array{create: bool, read: bool, read_private: bool, update: bool, delete: bool}
     */
    public function grantsForRole(Role $role): array
    {
        $allowed = FilePermission::query()
            ->where('role_id', $role->id)
            ->where('allowed', true)
            ->get(['action']);

        $map = [];
        foreach ($allowed as $grant) {
            $action = $grant->action instanceof FilePermissionAction
                ? $grant->action->value
                : (string) $grant->action;
            $map[$action] = true;
        }

        return [
            'create' => (bool) ($map['create'] ?? false),
            'read' => (bool) ($map['read'] ?? false),
            'read_private' => (bool) ($map['read_private'] ?? false),
            'update' => (bool) ($map['update'] ?? false),
            'delete' => (bool) ($map['delete'] ?? false),
        ];
    }
}
