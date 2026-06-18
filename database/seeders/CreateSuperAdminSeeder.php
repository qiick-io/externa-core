<?php

namespace Database\Seeders;

use App\Enums\RoleEnum;
use App\Models\User;
use Illuminate\Database\Seeder;

class CreateSuperAdminSeeder extends Seeder
{
    /**
     * Create or update the initial application user with the super-admin role.
     *
     * Credentials come from config/super_admin.php (env-prefixed keys).
     */
    public function run(): void
    {
        $user = User::query()->updateOrCreate(
            ['email' => config('super_admin.email')],
            [
                'first_name' => config('super_admin.first_name'),
                'last_name' => config('super_admin.last_name'),
                'password' => config('super_admin.password'),
                'email_verified_at' => now(),
                'is_active' => true,
            ],
        );

        $user->syncRoles([RoleEnum::SuperAdmin->value]);
    }
}
