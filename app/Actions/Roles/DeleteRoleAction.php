<?php

declare(strict_types=1);

namespace App\Actions\Roles;

use App\Models\Role;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Delete a role inside a transaction so Spatie's permission detach rolls back if the
 * `api_keys.role_id` restrict FK refuses the DELETE (#833 / 1.5.1).
 */
final class DeleteRoleAction
{
    /**
     * Delete one role. Callers must have already authorised the delete.
     *
     * @throws QueryException when a foreign key still references the role
     */
    public function execute(Role $role): void
    {
        DB::transaction(function () use ($role): void {
            $role->delete();
        });
    }
}
