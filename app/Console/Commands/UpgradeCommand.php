<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;
use Symfony\Component\Console\Attribute\AsCommand;

/**
 * Safe automated subset of an Externa upgrade (migrate + permission sync + cache clear).
 *
 * Does not run composer/npm — operators still fetch the release first. See docs /docs/upgrade.
 */
#[AsCommand(name: 'externa:upgrade')]
class UpgradeCommand extends Command
{
    protected $signature = 'externa:upgrade
        {--force : Allow production APP_ENV and/or a dirty git working tree}
        {--no-migrate : Skip php artisan migrate --force}
        {--no-permissions : Skip permissions:sync}
        {--prune-permissions : Pass --prune to permissions:sync}';

    protected $description = 'Run safe post-fetch upgrade steps (migrate, permissions:sync, cache clear)';

    public function handle(): int
    {
        $force = (bool) $this->option('force');

        if (app()->environment('production') && ! $force) {
            $this->error('Refusing to run in production without --force.');

            return self::FAILURE;
        }

        if ($this->gitTreeIsDirty() && ! $force) {
            $this->error('Git working tree is dirty. Commit/stash changes, or pass --force.');

            return self::FAILURE;
        }

        $this->warn('externa:upgrade does not run composer or npm.');
        $this->line('Fetch the release first (Packagist update or git checkout tag), then:');
        $this->line('  composer install --no-dev --optimize-autoloader');
        $this->line('  npm ci && npm run build');
        $this->newLine();

        if (! $this->option('no-migrate')) {
            $this->info('Running migrate --force…');
            $code = $this->call('migrate', ['--force' => true]);
            if ($code !== self::SUCCESS) {
                return $code;
            }
        }

        if (! $this->option('no-permissions')) {
            $this->info('Running permissions:sync…');
            $args = [];
            if ($this->option('prune-permissions')) {
                $args['--prune'] = true;
            }
            $code = $this->call('permissions:sync', $args);
            if ($code !== self::SUCCESS) {
                return $code;
            }
        }

        $this->info('Clearing caches…');
        $this->call('optimize:clear');

        $this->newLine();
        $this->info('Automated subset done. Smoke: login + open one collection.');
        $this->line('Full checklist: https://docs.externa.qiick.io/docs/upgrade');

        return self::SUCCESS;
    }

    private function gitTreeIsDirty(): bool
    {
        if (! is_dir(base_path('.git'))) {
            return false;
        }

        $result = Process::path(base_path())->run(['git', 'status', '--porcelain']);

        return $result->successful() && trim($result->output()) !== '';
    }
}
