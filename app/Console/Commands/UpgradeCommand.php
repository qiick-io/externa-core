<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\AppVersionService;
use App\Services\Mcp\McpOAuthServerService;
use App\Services\Upgrade\UpgradeGitService;
use Illuminate\Console\Command;
use Illuminate\Contracts\Process\ProcessResult;
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

        $this->ensurePassportKeys();

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
        // optimize:clear leaves Lighthouse's schema file; a stale one hides new GraphQL arguments and fields.
        $this->call('lighthouse:clear-cache');

        $this->newLine();
        $this->info('Automated subset done. Smoke: login + open one collection.');
        $this->line('Full checklist: https://docs.qiick.io/externa/upgrade');

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

        $mergeBase = $this->git(['merge-base', 'HEAD', $tag]);
        $hasSharedHistory = $mergeBase->successful() && trim($mergeBase->output()) !== '';

        if (! $hasSharedHistory && $mergeBase->exitCode() !== 1) {
            $this->error('Could not compute the merge base of HEAD and '.$tag.': '.trim($mergeBase->errorOutput() ?: $mergeBase->output()));

            return self::FAILURE;
        }

        $installedTag = null;

        if (! $hasSharedHistory) {
            $installedTag = $this->installedVersionTag();

            if ($installedTag === null) {
                return self::FAILURE;
            }

            $this->explainHistoryLink($installedTag, $dryRun);
        }

        // Once the histories are linked at the installed tag, the merge brings exactly what
        // upstream changed between that tag and the target, so that is the diff to preview.
        $diffBase = $installedTag ?? 'HEAD';
        $diff = $this->git(['diff', '--name-status', $diffBase, $tag]);
        if (! $diff->successful()) {
            $this->error('Could not diff '.$diffBase.'..'.$tag.': '.trim($diff->errorOutput() ?: $diff->output()));

            return self::FAILURE;
        }

        $lines = array_values(array_filter(array_map('trim', explode("\n", $diff->output()))));
        $count = count($lines);

        if ($count === 0) {
            $this->info("No file differences between {$diffBase} and {$tag}.");
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

        if ($installedTag !== null && ! $this->linkUpstreamHistory($installedTag)) {
            return self::FAILURE;
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

    /**
     * The upstream tag of the installed version (`AppVersionService`), checked to exist locally.
     *
     * A `composer create-project` tree was created from exactly that tag, so it is the only
     * honest ancestor to record. A dev build or an unreadable version has no tag: the command
     * stops instead of guessing one, because a wrong ancestor would silently drop upstream changes.
     */
    private function installedVersionTag(): ?string
    {
        $installedVersion = app(AppVersionService::class)->current();
        $installedTag = str_starts_with($installedVersion, 'v') ? $installedVersion : 'v'.$installedVersion;
        $verify = $this->git(['rev-parse', '--verify', '--quiet', 'refs/tags/'.$installedTag]);

        if ($verify->successful()) {
            return $installedTag;
        }

        $this->error("This repository shares no history with upstream, and the installed version ({$installedVersion}) has no matching tag {$installedTag}.");
        $this->line('Link the histories by hand at the release tag this tree was created from, then re-run:');
        $this->line('  git merge -s ours --allow-unrelated-histories -m "chore: link upstream history at vA.B.C" vA.B.C');
        $this->line('Or start from a clone of '.self::UPSTREAM_URL.' at a release tag.');

        return null;
    }

    private function explainHistoryLink(string $installedTag, bool $dryRun): void
    {
        $this->warn('This repository shares no history with upstream (typical after composer create-project).');
        $this->line(($dryRun ? 'Would first link' : 'First linking').' the histories at the installed version, without changing any file:');
        $this->line("  git merge -s ours --allow-unrelated-histories -m \"chore: link upstream history at {$installedTag}\" {$installedTag}");
        $this->line('Later syncs merge normally from that point.');
        $this->newLine();
    }

    /**
     * Records the installed tag as an ancestor of HEAD with the `ours` strategy (no file
     * changes), so the following merge is a three-way merge instead of add/add conflicts.
     *
     * Side effect: creates one merge commit in the working repository.
     */
    private function linkUpstreamHistory(string $installedTag): bool
    {
        $link = $this->git($this->historyLinkArguments($installedTag));

        if (! $link->successful()) {
            $this->error('Could not link the upstream history at '.$installedTag.': '.trim($link->errorOutput() ?: $link->output()));

            return false;
        }

        $this->info("Linked upstream history at {$installedTag}.");

        return true;
    }

    /**
     * @return list<string>
     */
    private function historyLinkArguments(string $installedTag): array
    {
        return [
            'merge', '-s', 'ours', '--allow-unrelated-histories',
            '-m', "chore: link upstream history at {$installedTag}", $installedTag,
        ];
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
        return app(UpgradeGitService::class)->run($args);
    }

    /**
     * Passport signing keys for MCP OAuth (#815). Idempotent: skips when env PEMs or files exist.
     */
    private function ensurePassportKeys(): void
    {
        if (app(McpOAuthServerService::class)->hasPassportKeys()) {
            return;
        }

        $this->info('Generating Passport OAuth signing keys…');
        $this->call('passport:keys', ['--no-interaction' => true]);
    }
}
