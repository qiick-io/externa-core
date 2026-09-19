<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Support\Facades\Process;
use Symfony\Component\Console\Attribute\AsCommand;

/**
 * Safe automated subset of an Externa upgrade (migrate + permission sync + cache clear).
 *
 * Optionally opt-in to git sync from the official upstream remote before those steps.
 * Does not run composer/npm — operators still install deps after code lands. See /docs/upgrade.
 */
#[AsCommand(name: 'externa:upgrade')]
class UpgradeCommand extends Command
{
    public const UPSTREAM_REMOTE = 'upstream';

    public const UPSTREAM_URL = 'https://github.com/qiick-io/externa-core.git';

    protected $signature = 'externa:upgrade
        {--force : Allow production APP_ENV and/or a dirty git working tree}
        {--no-migrate : Skip php artisan migrate --force}
        {--no-permissions : Skip permissions:sync}
        {--prune-permissions : Pass --prune to permissions:sync}
        {--sync-upstream= : Opt-in: fetch official upstream and merge a release tag (e.g. v1.0.0). WARNING: may overwrite customized files}
        {--dry-run : With --sync-upstream: list files that would change; do not merge or migrate}
        {--yes : Skip confirmation when applying --sync-upstream}';

    protected $description = 'Run post-fetch upgrade steps (migrate, permissions:sync, cache clear); optional opt-in --sync-upstream';

    public function handle(): int
    {
        $force = (bool) $this->option('force');
        $syncTag = $this->normalizedSyncTag();
        $dryRun = (bool) $this->option('dry-run');

        if ($dryRun && $syncTag === null) {
            $this->error('--dry-run requires --sync-upstream=vX.Y.Z.');

            return self::FAILURE;
        }

        if ($this->syncFlagPresentWithoutTag()) {
            $this->error('Pass a release tag: --sync-upstream=vX.Y.Z');

            return self::FAILURE;
        }

        if (app()->environment('production') && ! $force) {
            $this->error('Refusing to run in production without --force.');

            return self::FAILURE;
        }

        if ($syncTag !== null) {
            $sync = $this->syncFromUpstream($syncTag, $dryRun, $force);
            if ($sync !== self::SUCCESS) {
                return $sync;
            }
            if ($dryRun) {
                return self::SUCCESS;
            }
        } elseif ($this->gitTreeIsDirty() && ! $force) {
            $this->error('Git working tree is dirty. Commit/stash changes, or pass --force.');

            return self::FAILURE;
        }

        $this->warn('externa:upgrade does not run composer or npm.');
        $this->line('After code is on the target release:');
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

    /**
     * @return self::SUCCESS|self::FAILURE
     */
    private function syncFromUpstream(string $tag, bool $dryRun, bool $force): int
    {
        $this->warn('WARNING: --sync-upstream may overwrite customized app files and can fail on heavy forks.');
        $this->line('Prefer a clean tree, backup first, and resolve conflicts manually if merge stops.');
        $this->newLine();

        if (! $this->isGitRepo()) {
            $this->error('Refusing --sync-upstream: not a git repository. Clone or init git, or merge upstream by hand.');

            return self::FAILURE;
        }

        if ($this->gitTreeIsDirty() && ! $force) {
            $this->error('Git working tree is dirty. Commit/stash changes, or pass --force (not recommended with --sync-upstream).');

            return self::FAILURE;
        }

        if (! $this->ensureUpstreamRemote()) {
            return self::FAILURE;
        }

        $fetch = $this->git(['fetch', '--tags', self::UPSTREAM_REMOTE]);
        if (! $fetch->successful()) {
            $this->error('git fetch failed: '.trim($fetch->errorOutput() ?: $fetch->output()));

            return self::FAILURE;
        }

        $verify = $this->git(['rev-parse', '--verify', 'refs/tags/'.$tag]);
        if (! $verify->successful()) {
            $this->error("Tag not found after fetch: {$tag} (expected refs/tags/{$tag} on ".self::UPSTREAM_REMOTE.').');

            return self::FAILURE;
        }

        $diff = $this->git(['diff', '--name-status', 'HEAD', $tag]);
        if (! $diff->successful()) {
            $this->error('Could not diff HEAD..'.$tag.': '.trim($diff->errorOutput() ?: $diff->output()));

            return self::FAILURE;
        }

        $lines = array_values(array_filter(array_map('trim', explode("\n", $diff->output()))));
        $count = count($lines);

        if ($count === 0) {
            $this->info("No file differences between HEAD and {$tag}.");
        } else {
            $this->info("{$count} file(s) would change relative to {$tag}:");
            foreach ($lines as $line) {
                $this->line('  '.$line);
            }
        }

        if ($dryRun) {
            $this->newLine();
            $this->info('Dry-run only — no merge, no migrate. Re-run without --dry-run to apply.');

            return self::SUCCESS;
        }

        if ($count > 0 && ! $this->option('yes')) {
            if (! $this->confirm("{$count} files will be overwritten / changed — proceed with caution?", false)) {
                $this->warn('Aborted — left working tree untouched.');

                return self::FAILURE;
            }
        }

        $merge = $this->git(['merge', '--no-edit', $tag]);
        if (! $merge->successful()) {
            $this->error('Merge failed (conflicts or other git error). Resolve manually; do not migrate until the tree is clean.');
            $detail = trim($merge->errorOutput() ?: $merge->output());
            if ($detail !== '') {
                $this->line($detail);
            }

            return self::FAILURE;
        }

        $this->info('Synced from '.self::UPSTREAM_REMOTE." tag {$tag}.");

        return self::SUCCESS;
    }

    private function ensureUpstreamRemote(): bool
    {
        $remotes = $this->git(['remote']);
        if (! $remotes->successful()) {
            $this->error('Could not list git remotes.');

            return false;
        }

        $names = array_filter(array_map('trim', explode("\n", $remotes->output())));
        if (in_array(self::UPSTREAM_REMOTE, $names, true)) {
            return true;
        }

        $this->line('Adding remote '.self::UPSTREAM_REMOTE.' → '.self::UPSTREAM_URL);
        $add = $this->git(['remote', 'add', self::UPSTREAM_REMOTE, self::UPSTREAM_URL]);
        if (! $add->successful()) {
            $this->error('Failed to add upstream remote: '.trim($add->errorOutput() ?: $add->output()));

            return false;
        }

        return true;
    }

    private function normalizedSyncTag(): ?string
    {
        $raw = $this->option('sync-upstream');
        if ($raw === null || $raw === false) {
            return null;
        }

        $tag = trim((string) $raw);

        return $tag === '' ? null : $tag;
    }

    private function syncFlagPresentWithoutTag(): bool
    {
        if ($this->normalizedSyncTag() !== null) {
            return false;
        }

        return $this->input->hasParameterOption('--sync-upstream', true);
    }

    private function isGitRepo(): bool
    {
        $result = $this->git(['rev-parse', '--is-inside-work-tree']);

        return $result->successful() && trim($result->output()) === 'true';
    }

    private function gitTreeIsDirty(): bool
    {
        if (! $this->isGitRepo()) {
            return false;
        }

        $result = $this->git(['status', '--porcelain']);

        return $result->successful() && trim($result->output()) !== '';
    }

    /**
     * @param  list<string>  $args
     */
    private function git(array $args): ProcessResult
    {
        return Process::path(base_path())->run(array_merge(['git'], $args));
    }
}
