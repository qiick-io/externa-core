<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            PermissionSeeder::class,
            RoleSeeder::class,
            CreateSuperAdminSeeder::class,
        ]);

        // Heavy CMS demo (packs, kitchen sink, users). Opt-in only — keeps CI/install lean.
        if ($this->shouldSeedRichDemo()) {
            $this->call(DemoSeeder::class);
        }
    }

    private function shouldSeedRichDemo(): bool
    {
        if (app()->environment('testing')) {
            return false;
        }

        return filter_var(env('SEED_DEMO_RICH', false), FILTER_VALIDATE_BOOLEAN);
    }
}
