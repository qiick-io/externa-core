<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Symfony\Component\Console\Attribute\AsCommand;

use function Laravel\Prompts\confirm;
use function Laravel\Prompts\select;
use function Laravel\Prompts\text;

/**
 * Interactive first-run installer for a fresh Externa tree.
 */
#[AsCommand(name: 'externa:install')]
class InstallCommand extends Command
{
    protected $signature = 'externa:install
        {--force : Allow overwriting an existing .env / running when APP_ENV looks like production}
        {--no-npm : Skip npm install / build}
        {--no-seed : Skip db:seed}';

    protected $description = 'Interactive first-run setup: write .env, migrate, optional seed, npm build';

    public function handle(): int
    {
        $force = (bool) $this->option('force');

        if ($this->looksLikeProduction() && ! $force) {
            $this->error('Refusing: APP_ENV looks like production (or production .env present). Pass --force if you really mean it.');

            return self::FAILURE;
        }

        $this->info('Externa interactive installer');
        $this->line('Non-interactive CI path remains: composer setup');
        $this->newLine();

        $appName = text('APP_NAME', default: 'Externa', required: true);
        $appUrl = text('APP_URL', default: 'http://localhost', required: true);
        $db = select('Database', [
            'sqlite' => 'SQLite (local default)',
            'pgsql' => 'PostgreSQL',
            'mysql' => 'MySQL 8+',
            'mariadb' => 'MariaDB',
        ], default: 'sqlite');
        $stack = select('Queue / broadcast profile', [
            'minimal' => 'Minimal (database queue, log broadcast — no Redis)',
            'full' => 'Full (redis queue, reverb broadcast — needs Redis)',
        ], default: 'minimal');
        $seed = ! $this->option('no-seed') && confirm('Run db:seed (roles + super admin)?', default: true);
        $aiUrl = text('LOCAL_AI_URL (optional, blank to skip)', default: '');

        $envPath = base_path('.env');
        if (File::exists($envPath) && ! $force) {
            if (! confirm('.env already exists. Overwrite?', default: false)) {
                $this->warn('Aborted — left existing .env untouched.');

                return self::FAILURE;
            }
        }

        if (! File::exists(base_path('.env.example'))) {
            $this->error('.env.example missing.');

            return self::FAILURE;
        }

        $env = File::get(base_path('.env.example'));
        $env = $this->setEnv($env, 'APP_NAME', $appName);
        $env = $this->setEnv($env, 'APP_URL', $appUrl);
        $env = $this->applyDatabase($env, $db);
        $env = $this->applyStack($env, $stack);
        if (trim($aiUrl) !== '') {
            $env = $this->setEnv($env, 'LOCAL_AI_URL', trim($aiUrl));
        }

        File::put($envPath, $env);
        $this->info('Wrote .env');

        if ($db === 'sqlite') {
            $sqlite = database_path('database.sqlite');
            if (! File::exists($sqlite)) {
                File::put($sqlite, '');
                $this->line('Created database/database.sqlite');
            }
        }

        $this->call('key:generate', ['--force' => true]);
        $this->call('migrate', ['--force' => true]);

        if ($seed) {
            $this->call('db:seed', ['--force' => true]);
        }

        $this->call('storage:link');

        if (! $this->option('no-npm')) {
            $this->info('npm install…');
            $install = Process::path(base_path())->timeout(600)->run(['npm', 'install']);
            if (! $install->successful()) {
                $this->error($install->errorOutput() ?: $install->output());

                return self::FAILURE;
            }

            Process::path(base_path())->timeout(120)->run([
                'php', 'artisan', 'wayfinder:generate', '--with-form', '--no-interaction',
            ]);

            $this->info('npm run build…');
            $build = Process::path(base_path())->timeout(600)->run(['npm', 'run', 'build']);
            if (! $build->successful()) {
                $this->error($build->errorOutput() ?: $build->output());

                return self::FAILURE;
            }
        }

        $this->newLine();
        $this->info('Install complete.');
        $this->line('Next: composer run dev   (or Herd + queue worker)');
        $this->line('Docs: https://docs.externa.qiick.io/docs/installation');

        return self::SUCCESS;
    }

    private function looksLikeProduction(): bool
    {
        if (app()->environment('production')) {
            return true;
        }

        if (! File::exists(base_path('.env'))) {
            return false;
        }

        $env = File::get(base_path('.env'));

        return (bool) preg_match('/^APP_ENV\s*=\s*production\s*$/mi', $env);
    }

    private function setEnv(string $env, string $key, string $value): string
    {
        $escaped = $this->escapeEnvValue($value);
        $pattern = '/^'.preg_quote($key, '/').'=.*$/m';

        if (preg_match($pattern, $env)) {
            return preg_replace($pattern, $key.'='.$escaped, $env) ?? $env;
        }

        return rtrim($env)."\n{$key}={$escaped}\n";
    }

    private function escapeEnvValue(string $value): string
    {
        if ($value === '' || preg_match('/[\s#"\']/', $value)) {
            return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $value).'"';
        }

        return $value;
    }

    private function applyDatabase(string $env, string $db): string
    {
        $env = $this->setEnv($env, 'DB_CONNECTION', $db);

        if ($db === 'sqlite') {
            return $env;
        }

        $host = text('DB_HOST', default: '127.0.0.1', required: true);
        $port = text('DB_PORT', default: $db === 'pgsql' ? '5432' : '3306', required: true);
        $database = text('DB_DATABASE', default: 'externa', required: true);
        $username = text('DB_USERNAME', default: 'root', required: true);
        $password = text('DB_PASSWORD', default: '');

        $env = $this->setEnv($env, 'DB_HOST', $host);
        $env = $this->setEnv($env, 'DB_PORT', $port);
        $env = $this->setEnv($env, 'DB_DATABASE', $database);
        $env = $this->setEnv($env, 'DB_USERNAME', $username);

        return $this->setEnv($env, 'DB_PASSWORD', $password);
    }

    private function applyStack(string $env, string $stack): string
    {
        if ($stack === 'minimal') {
            $env = $this->setEnv($env, 'QUEUE_CONNECTION', 'database');
            $env = $this->setEnv($env, 'CACHE_STORE', 'database');
            $env = $this->setEnv($env, 'SESSION_DRIVER', 'database');
            $env = $this->setEnv($env, 'BROADCAST_CONNECTION', 'log');
            $env = $this->setEnv($env, 'PULSE_ENABLED', 'false');

            return $env;
        }

        $env = $this->setEnv($env, 'QUEUE_CONNECTION', 'redis');
        $env = $this->setEnv($env, 'CACHE_STORE', 'redis');
        $env = $this->setEnv($env, 'SESSION_DRIVER', 'database');
        $env = $this->setEnv($env, 'BROADCAST_CONNECTION', 'reverb');
        $env = $this->setEnv($env, 'PULSE_ENABLED', 'true');

        return $env;
    }
}
