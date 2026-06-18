<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        Artisan::call('permissions:sync');
    }
}
