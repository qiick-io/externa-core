<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\CreateInitialSuperAdminAction;
use App\Console\Concerns\ManagesDotEnvTrait;
use App\Data\InitialSuperAdminData;
use App\Models\User;
use Database\Seeders\CreateSuperAdminSeeder;
use Illuminate\Console\Command;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Symfony\Component\Console\Attribute\AsCommand;

use function Laravel\Prompts\confirm;
use function Laravel\Prompts\password;
use function Laravel\Prompts\select;
use function Laravel\Prompts\text;

/**
 * Interactive first-run installer for a fresh Externa tree.
 */
#[AsCommand(name: 'externa:install')]
class InstallCommand extends Command
{
    use ManagesDotEnvTrait;

    protected $signature = 'externa:install
        {--force : Allow overwriting an existing .env / running when APP_ENV looks like production}
        {--no-npm : Skip npm install / build}
        {--no-seed : Skip db:seed}';

    protected $description = 'Interactive first-run setup: write .env, migrate, optional seed, npm build';

    public function handle(CreateInitialSuperAdminAction $createInitialSuperAdmin): int
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

        $preservedAppKey = $this->resolvePreservedAppKey($envPath);
        $preservedAppEnv = $this->resolvePreservedAppEnv($envPath);

        $env = File::get(base_path('.env.example'));
        $env = $this->setEnv($env, 'APP_NAME', $appName);
        $env = $this->setEnv($env, 'APP_URL', $appUrl);
        $env = $this->applyDatabase($env, $db);
        $env = $this->applyStack($env, $stack);
        if (trim($aiUrl) !== '') {
            $env = $this->setEnv($env, 'LOCAL_AI_URL', trim($aiUrl));
        }

        if ($preservedAppKey !== null) {
            $env = $this->setEnv($env, 'APP_KEY', $preservedAppKey);
        }

        if ($preservedAppEnv !== null) {
            $env = $this->setEnv($env, 'APP_ENV', $preservedAppEnv);
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

        $this->ensureApplicationKey($envPath, $preservedAppKey);
        $this->applyRuntimeConfig($db, $stack);
        $this->syncSuperAdminConfigFromEnvFile($envPath);

        $migrate = $this->runMigrate($db, $force);
        if ($migrate !== self::SUCCESS) {
            return $migrate;
        }

        if ($seed) {
            $credentialsCode = $this->prepareInitialSuperAdminCredentials($envPath);
            if ($credentialsCode !== self::SUCCESS) {
                return $credentialsCode;
            }

            $seedCode = $this->runArtisanProcess($db, ['db:seed', '--force', '--no-interaction', '--database='.$db]);
            if ($seedCode !== self::SUCCESS) {
                return $seedCode;
            }

            $adminCode = $this->ensureInitialSuperAdminOutsideDevelopment($createInitialSuperAdmin, $envPath);
            if ($adminCode !== self::SUCCESS) {
                return $adminCode;
            }
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
        $this->line('Next: composer run dev   (or a local *.test site + queue worker)');
        $this->line('Docs: https://docs.qiick.io/externa/installation');

        return self::SUCCESS;
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

    /**
     * Prefer an existing valid APP_KEY from the current .env (or boot config) so
     * rewriting from .env.example does not blank a key already present in the process.
     */
    private function resolvePreservedAppKey(string $envPath): ?string
    {
        if (File::exists($envPath)) {
            $existing = File::get($envPath);
            if (preg_match('/^APP_KEY=(.*)$/m', $existing, $matches) === 1) {
                $fromFile = $this->unwrapEnvValue(trim($matches[1]));
                if ($this->isValidAppKey($fromFile)) {
                    return $fromFile;
                }
            }
        }

        $fromConfig = (string) config('app.key');
        if ($this->isValidAppKey($fromConfig)) {
            return $fromConfig;
        }

        return null;
    }

    /**
     * Keep APP_ENV when rewriting .env so a production --force install still runs
     * outside local/testing and must supply a real first-admin password (#821).
     */
    private function resolvePreservedAppEnv(string $envPath): ?string
    {
        $fromFile = $this->readEnvKey($envPath, 'APP_ENV');

        if (is_string($fromFile) && $fromFile !== '') {
            return $fromFile;
        }

        return null;
    }

    /**
     * Collect INITIAL_SUPER_ADMIN_* when the seeder will not create an admin (#821).
     *
     * @return self::SUCCESS|self::FAILURE
     */
    private function prepareInitialSuperAdminCredentials(string $envPath): int
    {
        $environment = $this->readEnvKey($envPath, 'APP_ENV') ?? (string) app()->environment();
        $password = $this->readEnvKey($envPath, 'INITIAL_SUPER_ADMIN_PASSWORD');

        if (CreateSuperAdminSeeder::installMustFailClosed($this->input->isInteractive(), $environment, $password)) {
            $rejection = CreateSuperAdminSeeder::passwordRejectionReason($password, $environment)
                ?? 'INITIAL_SUPER_ADMIN_PASSWORD is missing or not allowed.';
            $this->error('Refusing: '.$rejection.' Set a strong INITIAL_SUPER_ADMIN_PASSWORD in .env or run interactively (no default admin is created).');

            return self::FAILURE;
        }

        if (! CreateSuperAdminSeeder::installNeedsCredentials($environment, $password)) {
            return self::SUCCESS;
        }

        $emailDefault = $this->readEnvKey($envPath, 'INITIAL_SUPER_ADMIN_EMAIL')
            ?: (string) config('super_admin.email');
        $email = text('Super admin email', default: $emailDefault, required: true);
        $plainPassword = password(
            label: 'Super admin password',
            required: true,
            validate: function (string $value): ?string {
                $validator = Validator::make(
                    ['password' => $value],
                    ['password' => ['required', 'string', Password::defaults()]],
                );

                return $validator->fails() ? $validator->errors()->first('password') : null;
            },
        );

        $env = File::get($envPath);
        $env = $this->setEnv($env, 'INITIAL_SUPER_ADMIN_EMAIL', $email);
        $env = $this->setEnv($env, 'INITIAL_SUPER_ADMIN_PASSWORD', $plainPassword);
        File::put($envPath, $env);
        $this->syncSuperAdminConfigFromEnvFile($envPath);
        $this->info('Wrote initial super-admin credentials to .env');

        return self::SUCCESS;
    }

    /**
     * After db:seed outside local/testing, create the first admin from config when missing.
     *
     * @return self::SUCCESS|self::FAILURE
     */
    private function ensureInitialSuperAdminOutsideDevelopment(
        CreateInitialSuperAdminAction $createInitialSuperAdmin,
        string $envPath,
    ): int {
        $environment = $this->readEnvKey($envPath, 'APP_ENV') ?? (string) app()->environment();

        if (in_array($environment, CreateSuperAdminSeeder::ENVIRONMENTS, true)) {
            return self::SUCCESS;
        }

        $this->syncSuperAdminConfigFromEnvFile($envPath);

        $password = config('super_admin.password');
        $password = is_string($password) ? $password : null;
        $rejection = CreateSuperAdminSeeder::passwordRejectionReason($password, $environment);

        if ($rejection !== null) {
            $this->error('Refusing: '.$rejection);

            return self::FAILURE;
        }

        if (User::query()->where('email', (string) config('super_admin.email'))->exists()) {
            return self::SUCCESS;
        }

        $user = $createInitialSuperAdmin->execute(new InitialSuperAdminData(
            firstName: (string) config('super_admin.first_name'),
            lastName: (string) config('super_admin.last_name'),
            email: (string) config('super_admin.email'),
            password: $password,
        ));

        if ($user === null) {
            return self::SUCCESS;
        }

        $this->info("Created super admin {$user->email}.");

        return self::SUCCESS;
    }

    /**
     * Push INITIAL_SUPER_ADMIN_* from the written .env into config for this process.
     */
    private function syncSuperAdminConfigFromEnvFile(string $envPath): void
    {
        config([
            'super_admin.first_name' => $this->readEnvKey($envPath, 'INITIAL_SUPER_ADMIN_FIRST_NAME')
                ?? (string) config('super_admin.first_name'),
            'super_admin.last_name' => $this->readEnvKey($envPath, 'INITIAL_SUPER_ADMIN_LAST_NAME')
                ?? (string) config('super_admin.last_name'),
            'super_admin.email' => $this->readEnvKey($envPath, 'INITIAL_SUPER_ADMIN_EMAIL')
                ?? (string) config('super_admin.email'),
            'super_admin.password' => $this->readEnvKey($envPath, 'INITIAL_SUPER_ADMIN_PASSWORD'),
        ]);
    }

    private function readEnvKey(string $envPath, string $key): ?string
    {
        if (! File::exists($envPath)) {
            return null;
        }

        $contents = File::get($envPath);

        if (preg_match('/^'.preg_quote($key, '/').'=(.*)$/m', $contents, $matches) !== 1) {
            return null;
        }

        return $this->unwrapEnvValue(trim($matches[1]));
    }

    private function unwrapEnvValue(string $value): string
    {
        if ($value === '') {
            return '';
        }

        if (
            (str_starts_with($value, '"') && str_ends_with($value, '"'))
            || (str_starts_with($value, "'") && str_ends_with($value, "'"))
        ) {
            return stripcslashes(substr($value, 1, -1));
        }

        return $value;
    }

    private function isValidAppKey(string $key): bool
    {
        return $key !== '' && str_starts_with($key, 'base64:');
    }

    /**
     * Write a fresh APP_KEY when missing. Avoids key:generate failing when the
     * in-memory key no longer matches the rewritten .env file.
     */
    private function ensureApplicationKey(string $envPath, ?string $preservedAppKey): void
    {
        if ($preservedAppKey !== null) {
            config(['app.key' => $preservedAppKey]);
            $this->line('Preserved existing APP_KEY');

            return;
        }

        $key = 'base64:'.base64_encode(
            Encrypter::generateKey((string) config('app.cipher'))
        );

        $env = File::get($envPath);
        File::put($envPath, $this->setEnv($env, 'APP_KEY', $key));
        config(['app.key' => $key]);
        $this->info('Application key set successfully.');
    }

    /**
     * Apply the selected profile to the already-booted config so migrate/seed
     * do not keep .env.example defaults (e.g. CACHE_STORE=redis).
     */
    private function applyRuntimeConfig(string $db, string $stack): void
    {
        config(['database.default' => $db]);

        if ($db === 'sqlite') {
            config([
                'database.connections.sqlite.database' => database_path('database.sqlite'),
            ]);
        }

        if ($stack === 'minimal') {
            config([
                'queue.default' => 'database',
                'cache.default' => 'database',
                'session.driver' => 'database',
                'broadcasting.default' => 'log',
                'pulse.enabled' => false,
            ]);
        } else {
            config([
                'queue.default' => 'redis',
                'cache.default' => 'redis',
                'session.driver' => 'database',
                'broadcasting.default' => 'reverb',
                'pulse.enabled' => true,
            ]);
        }

        // Drop boot-time drivers that may still point at Redis / the previous DB.
        if ($this->laravel->bound('cache')) {
            $this->laravel->make('cache')->forgetDriver();
        }

        // Re-resolve only the selected connection so migrate does not reuse a
        // boot-time PDO (e.g. still on Redis-backed defaults or another driver).
        DB::purge($db);
    }

    private function runMigrate(string $db, bool $force): int
    {
        $code = $this->runArtisanProcess($db, [
            'migrate',
            '--force',
            '--no-interaction',
            '--database='.$db,
        ]);

        if ($code === self::SUCCESS) {
            return self::SUCCESS;
        }

        if ($db !== 'sqlite' || ! $force) {
            return $code;
        }

        // Clear reset path for a half-applied SQLite install (DDL is not transactional).
        $this->warn('Migrate failed; resetting SQLite database and retrying…');
        $sqlite = database_path('database.sqlite');
        File::put($sqlite, '');
        config(['database.connections.sqlite.database' => $sqlite]);
        DB::purge('sqlite');

        return $this->runArtisanProcess('sqlite', [
            'migrate',
            '--force',
            '--no-interaction',
            '--database=sqlite',
        ]);
    }

    /**
     * Run artisan in a subprocess so parent process env (e.g. PHPUnit/CI DB_*)
     * cannot override the connection selected by this installer.
     *
     * @param  list<string>  $artisanArgs
     */
    private function runArtisanProcess(string $connection, array $artisanArgs): int
    {
        $result = Process::path(base_path())
            ->timeout(600)
            ->env($this->databaseProcessEnvironment($connection))
            ->run([PHP_BINARY, 'artisan', ...$artisanArgs]);

        if ($result->output() !== '') {
            $this->output->write($result->output());
        }

        if (! $result->successful()) {
            $this->error($result->errorOutput() !== '' ? $result->errorOutput() : $result->output());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * Explicit DB_* / cache env for installer subprocesses.
     *
     * @return array<string, string>
     */
    private function databaseProcessEnvironment(string $connection): array
    {
        $config = config('database.connections.'.$connection, []);
        $appKey = (string) config('app.key');

        $env = [
            'DB_CONNECTION' => $connection,
            'DB_URL' => '',
            'CACHE_STORE' => 'array',
            'QUEUE_CONNECTION' => (string) config('queue.default', 'database'),
        ];

        if ($appKey !== '') {
            $env['APP_KEY'] = $appKey;
        }

        if ($connection === 'sqlite') {
            $env['DB_DATABASE'] = (string) ($config['database'] ?? database_path('database.sqlite'));

            return $env;
        }

        $env['DB_HOST'] = (string) ($config['host'] ?? '127.0.0.1');
        $env['DB_PORT'] = (string) ($config['port'] ?? '');
        $env['DB_DATABASE'] = (string) ($config['database'] ?? '');
        $env['DB_USERNAME'] = (string) ($config['username'] ?? '');
        $env['DB_PASSWORD'] = (string) ($config['password'] ?? '');

        return $env;
    }
}
