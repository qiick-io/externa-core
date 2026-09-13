<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Initial super admin (CreateSuperAdminSeeder)
    |--------------------------------------------------------------------------
    |
    | Used only when seeding a first login user. Override via .env in each
    | environment; defaults are suitable for local development.
    |
    */

    'first_name' => env('INITIAL_SUPER_ADMIN_FIRST_NAME', 'Super'),
    'last_name' => env('INITIAL_SUPER_ADMIN_LAST_NAME', 'Admin'),
    'email' => env('INITIAL_SUPER_ADMIN_EMAIL', 'superadmin@example.com'),
    'password' => env('INITIAL_SUPER_ADMIN_PASSWORD', 'password'),
];
