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

    /**
     * Delete many roles; a late FK refusal counts as a skip instead of aborting the bulk.
     *
     * @param  list<int>  $roleIds
     * @return array{deleted: int, skippedForeignKey: int}
     */
    public function executeMany(array $roleIds): array
    {
        $deletedCount = 0;
        $skippedForeignKeyCount = 0;

        foreach ($roleIds as $roleId) {
            try {
                DB::transaction(function () use ($roleId): void {
                    $role = Role::query()->find($roleId);

                    if ($role === null) {
                        return;
                    }

                    $role->delete();
                });
                $deletedCount++;
            } catch (QueryException $exception) {
                if (! $this->isForeignKeyConstraintViolation($exception)) {
                    throw $exception;
                }

                $skippedForeignKeyCount++;
            }
        }

        return [
            'deleted' => $deletedCount,
            'skippedForeignKey' => $skippedForeignKeyCount,
        ];
    }

    /**
     * True when the engine refused a DELETE because a foreign key still references the row.
     */
    private function isForeignKeyConstraintViolation(QueryException $exception): bool
    {
        $sqlState = $exception->errorInfo[0] ?? null;
        $driverCode = $exception->errorInfo[1] ?? null;

        if ($sqlState === '23503') {
            return true;
        }

        if ($sqlState === '23000' && in_array($driverCode, [1451, 19], true)) {
            return true;
        }

        return str_contains(strtolower($exception->getMessage()), 'foreign key');
    }
}
