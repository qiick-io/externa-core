<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Initial super admin (CreateSuperAdminSeeder / externa:install)
    |--------------------------------------------------------------------------
    |
    | Used by `db:seed` only in `local` and `testing`, and only when a password
    | is set (#821). Outside those environments externa:install prompts (or uses
    | these keys when set). There is no default password in config.
    |
    */

    'first_name' => env('INITIAL_SUPER_ADMIN_FIRST_NAME', 'Super'),
    'last_name' => env('INITIAL_SUPER_ADMIN_LAST_NAME', 'Admin'),
    'email' => env('INITIAL_SUPER_ADMIN_EMAIL', 'superadmin@example.com'),
    'password' => env('INITIAL_SUPER_ADMIN_PASSWORD'),
];
