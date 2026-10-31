<?php

declare(strict_types=1);

namespace App\Services\Api;

use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Owner binding helpers: revoke on owner lifecycle, admin fallback for backfill.
 */
class ApiKeyOwnerService
{
    /**
     * Revoke every active key owned by the user and log an activity entry per key.
     *
     * @return int Number of keys revoked
     */
    public function revokeForOwner(User $owner, string $reason): int
    {
        $keys = ApiKey::query()
            ->where('owner_id', $owner->id)
            ->whereNull('revoked_at')
            ->get();

        $count = 0;
        foreach ($keys as $key) {
            $key->forceFill(['revoked_at' => now()])->save();
            activity('api')
                ->performedOn($key)
                ->causedBy($owner)
                ->withProperties([
                    'reason' => $reason,
                    'owner_id' => $owner->id,
                ])
                ->event('api_key_revoked')
                ->log('API key revoked because owner '.$reason);

            $count++;
        }

        return $count;
    }

    /**
     * Lowest-id active user with super-admin, else admin (direct Spatie role).
     */
    public function firstAdminUserId(): ?int
    {
        foreach ([RoleEnum::SuperAdmin->value, RoleEnum::Admin->value] as $roleName) {
            $id = DB::table('users')
                ->join('model_has_roles', function ($join): void {
                    $join->on('users.id', '=', 'model_has_roles.model_id')
                        ->where('model_has_roles.model_type', '=', User::class);
                })
                ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
                ->where('roles.name', $roleName)
                ->where('users.is_active', true)
                ->whereNull('users.deleted_at')
                ->orderBy('users.id')
                ->value('users.id');

            if ($id !== null) {
                return (int) $id;
            }
        }

        return null;
    }

    /**
     * Resolve owner for backfill: created_by when the user still exists, else first admin.
     */
    public function resolveBackfillOwnerId(?int $createdBy): ?int
    {
        if ($createdBy !== null) {
            $exists = DB::table('users')
                ->where('id', $createdBy)
                ->whereNull('deleted_at')
                ->exists();
            if ($exists) {
                return $createdBy;
            }
        }

        return $this->firstAdminUserId();
    }

    /**
     * Backfill null owner_id rows (migration + tests). Returns how many keys updated.
     */
    public function backfillMissingOwners(): int
    {
        $adminId = $this->firstAdminUserId();
        if ($adminId === null) {
            Log::warning('api_keys.owner_id backfill: no admin user found; keys without created_by stay ownerless.');
        }

        $updated = 0;
        $keys = DB::table('api_keys')
            ->whereNull('owner_id')
            ->select(['id', 'created_by'])
            ->orderBy('id')
            ->get();

        foreach ($keys as $key) {
            $ownerId = $this->resolveBackfillOwnerId(
                $key->created_by !== null ? (int) $key->created_by : null,
            );
            if ($ownerId === null) {
                continue;
            }
            DB::table('api_keys')->where('id', $key->id)->update(['owner_id' => $ownerId]);
            $updated++;
        }

        return $updated;
    }
}
