<?php

use App\Console\Commands\UpgradeCommand;
use Illuminate\Support\Facades\Artisan;

it('registers externa:upgrade', function () {
    expect(Artisan::all())->toHaveKey('externa:upgrade');
});

it('refuses production without --force', function () {
    $this->app['env'] = 'production';

    $this->artisan(UpgradeCommand::class)
        ->expectsOutputToContain('Refusing to run in production without --force.')
        ->assertFailed();
});

it('runs migrate and permissions sync with --force on production', function () {
    $this->app['env'] = 'production';

    $this->artisan(UpgradeCommand::class, [
        '--force' => true,
        '--no-migrate' => true,
        '--no-permissions' => true,
    ])
        ->expectsOutputToContain('Automated subset done')
        ->assertSuccessful();
});
