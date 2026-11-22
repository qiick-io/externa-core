<?php

declare(strict_types=1);

namespace App\Actions\Roles;

use App\Models\Role;
use Illuminate\Database\QueryException;

/**
 * Bulk-delete roles; a late `api_keys.role_id` FK refusal counts as a skip (#833 / 1.5.1).
 */
final class BulkDeleteRolesAction
{
    public function __construct(
        private readonly DeleteRoleAction $deleteRoleAction,
    ) {}

    /**
     * @param  list<int>  $roleIds
     * @return array{deleted: int, skippedForeignKey: int}
     */
    public function execute(array $roleIds): array
    {
        $deletedCount = 0;
        $skippedForeignKeyCount = 0;

        foreach ($roleIds as $roleId) {
            $role = Role::query()->find($roleId);

            if ($role === null) {
                continue;
            }

            try {
                $this->deleteRoleAction->execute($role);
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
