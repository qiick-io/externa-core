<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;

/**
 * Seed Spatie permissions from application enums via the `permissions:sync` command.
 */
class PermissionSeeder extends Seeder
{
    /**
     * Sync permission records to match {@see PermissionEnum} definitions.
     */
    public function run(): void
    {
        Artisan::call('permissions:sync');
    }
}
