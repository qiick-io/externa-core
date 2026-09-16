<?php

use App\Console\Commands\InstallCommand;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;

it('registers externa:install', function () {
    expect(Artisan::all())->toHaveKey('externa:install');
});

it('refuses production-looking env without --force', function () {
    $path = base_path('.env');
    $backup = File::exists($path) ? File::get($path) : null;
    File::put($path, "APP_ENV=production\nAPP_KEY=\n");

    try {
        $this->artisan(InstallCommand::class)
            ->expectsOutputToContain('Refusing: APP_ENV looks like production')
            ->assertFailed();
    } finally {
        if ($backup === null) {
            File::delete($path);
        } else {
            File::put($path, $backup);
        }
    }
});
