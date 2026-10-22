<?php

use App\Console\Commands\InstallCommand;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\PendingCommand;

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

it('preserves a valid in-memory APP_KEY into the rewritten .env', function () {
    $envPath = base_path('.env');
    $sqlite = database_path('database.sqlite');
    $envBackup = File::exists($envPath) ? File::get($envPath) : null;
    $sqliteBackup = File::exists($sqlite) ? File::get($sqlite) : null;

    // create-project already ran key:generate; installer rewrites .env from example (APP_KEY=).
    $existingKey = 'base64:'.base64_encode(Encrypter::generateKey(config('app.cipher')));
    config(['app.key' => $existingKey, 'cache.default' => 'redis', 'queue.default' => 'redis']);
    $_ENV['APP_KEY'] = $existingKey;
    $_SERVER['APP_KEY'] = $existingKey;
    putenv('APP_KEY='.$existingKey);

    File::put($envPath, "APP_ENV=local\nAPP_KEY=\nCACHE_STORE=redis\nQUEUE_CONNECTION=redis\n");
    File::put($sqlite, '');

    try {
        expectInstallQuestions()->assertSuccessful();

        $written = File::get($envPath);
        expect($written)->toContain('APP_KEY='.$existingKey)
            ->and($written)->toMatch('/^CACHE_STORE=database$/m')
            ->and(config('app.key'))->toBe($existingKey)
            ->and(config('cache.default'))->toBe('database')
            ->and(Schema::hasTable('migrations'))->toBeTrue();
    } finally {
        restoreInstallFixtures($envPath, $envBackup, $sqlite, $sqliteBackup);
    }
});

it('generates APP_KEY when none is present in .env or config', function () {
    $envPath = base_path('.env');
    $sqlite = database_path('database.sqlite');
    $envBackup = File::exists($envPath) ? File::get($envPath) : null;
    $sqliteBackup = File::exists($sqlite) ? File::get($sqlite) : null;

    config(['app.key' => '']);
    putenv('APP_KEY');
    unset($_ENV['APP_KEY'], $_SERVER['APP_KEY']);

    File::delete($envPath);
    File::put($sqlite, '');

    try {
        expectInstallQuestions()->assertSuccessful();

        expect(File::get($envPath))->toMatch('/^APP_KEY=base64:.+/m')
            ->and(config('app.key'))->toStartWith('base64:');
    } finally {
        restoreInstallFixtures($envPath, $envBackup, $sqlite, $sqliteBackup);
    }
});

it('migrates the minimal profile without Redis', function () {
    $envPath = base_path('.env');
    $sqlite = database_path('database.sqlite');
    $envBackup = File::exists($envPath) ? File::get($envPath) : null;
    $sqliteBackup = File::exists($sqlite) ? File::get($sqlite) : null;

    File::put($sqlite, '');
    config([
        'cache.default' => 'redis',
        'queue.default' => 'redis',
        'database.default' => 'sqlite',
        'database.connections.sqlite.database' => $sqlite,
    ]);

    try {
        expectInstallQuestions()
            ->expectsOutputToContain('Install complete.')
            ->assertSuccessful();

        expect(config('cache.default'))->toBe('database')
            ->and(config('queue.default'))->toBe('database')
            ->and(Schema::hasTable('permissions'))->toBeTrue();
    } finally {
        restoreInstallFixtures($envPath, $envBackup, $sqlite, $sqliteBackup);
    }
});

it('is safely re-runnable with --force', function () {
    $envPath = base_path('.env');
    $sqlite = database_path('database.sqlite');
    $envBackup = File::exists($envPath) ? File::get($envPath) : null;
    $sqliteBackup = File::exists($sqlite) ? File::get($sqlite) : null;

    File::put($sqlite, '');

    try {
        expectInstallQuestions()->assertSuccessful();

        $keyAfterFirst = config('app.key');

        expectInstallQuestions()
            ->expectsOutputToContain('Install complete.')
            ->assertSuccessful();

        expect(config('app.key'))->toBe($keyAfterFirst)
            ->and(File::get($envPath))->toContain('APP_KEY='.$keyAfterFirst)
            ->and(Schema::hasTable('permissions'))->toBeTrue();
    } finally {
        restoreInstallFixtures($envPath, $envBackup, $sqlite, $sqliteBackup);
    }
});

/**
 * @return PendingCommand
 */
function expectInstallQuestions()
{
    $databaseOptions = [
        'sqlite' => 'SQLite (local default)',
        'pgsql' => 'PostgreSQL',
        'mysql' => 'MySQL 8+',
        'mariadb' => 'MariaDB',
    ];
    $stackOptions = [
        'minimal' => 'Minimal (database queue, log broadcast — no Redis)',
        'full' => 'Full (redis queue, reverb broadcast — needs Redis)',
    ];

    return test()->artisan(InstallCommand::class, [
        '--force' => true,
        '--no-npm' => true,
        '--no-seed' => true,
    ])
        ->expectsQuestion('APP_NAME', 'Externa')
        ->expectsQuestion('APP_URL', 'http://localhost')
        ->expectsChoice('Database', 'sqlite', $databaseOptions)
        ->expectsChoice('Queue / broadcast profile', 'minimal', $stackOptions)
        ->expectsQuestion('LOCAL_AI_URL (optional, blank to skip)', '');
}

function restoreInstallFixtures(string $envPath, ?string $envBackup, string $sqlite, ?string $sqliteBackup): void
{
    if ($envBackup === null) {
        File::delete($envPath);
    } else {
        File::put($envPath, $envBackup);
    }

    if ($sqliteBackup === null) {
        if (File::exists($sqlite)) {
            File::delete($sqlite);
        }
    } else {
        File::put($sqlite, $sqliteBackup);
    }

    putenv('APP_KEY');
    unset($_ENV['APP_KEY'], $_SERVER['APP_KEY']);
}
