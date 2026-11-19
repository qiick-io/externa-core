<?php

declare(strict_types=1);

namespace App\Actions;

use App\Data\InitialSuperAdminData;
use App\Enums\RoleEnum;
use App\Models\User;

/**
 * Creates the first super-admin when missing; never rewrites an existing user (#821).
 */
class CreateInitialSuperAdminAction
{
    /**
     * Insert the admin when the email is unused; leave any existing row untouched.
     */
    public function execute(InitialSuperAdminData $data): ?User
    {
        $user = User::query()->firstOrNew(['email' => $data->email]);

        if ($user->exists) {
            return null;
        }

        $user->first_name = $data->firstName;
        $user->last_name = $data->lastName;
        $user->password = $data->password;
        $user->email_verified_at = now();
        $user->is_active = true;
        $user->save();
        $user->assignRole(RoleEnum::SuperAdmin->value);

        return $user;
    }
}
