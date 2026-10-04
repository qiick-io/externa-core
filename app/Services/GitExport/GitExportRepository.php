<?php

namespace App\Services\GitExport;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Maintains a local git worktree and commits/pushes export files.
 */
class GitExportRepository
{
    public function enabled(): bool
    {
        if (! config('git_export.enabled')) {
            return false;
        }

        $remote = config('git_export.remote_url');

        return is_string($remote) && trim($remote) !== '';
    }

    public function workDir(): string
    {
        $dir = config('git_export.work_dir');

        return is_string($dir) && $dir !== '' ? $dir : storage_path('app/git-export');
    }

    public function ensureRepository(): void
    {
        $dir = $this->workDir();
        File::ensureDirectoryExists($dir);

        if (is_dir($dir.DIRECTORY_SEPARATOR.'.git')) {
            $this->git(['fetch', 'origin'], $dir);
            $branch = (string) config('git_export.branch', 'main');
            $this->git(['checkout', $branch], $dir);
            $this->git(['pull', '--ff-only', 'origin', $branch], $dir);

            return;
        }

        $remote = (string) config('git_export.remote_url');
        $branch = (string) config('git_export.branch', 'main');
        // Empty template skips sample hooks (some sandboxed/locked FS reject .git/hooks writes).
        try {
            $this->git(['clone', '--template=', '--branch', $branch, '--single-branch', $remote, '.'], $dir);
        } catch (RuntimeException $exception) {
            // Empty bare remotes have no branch yet — clone --branch fails. Init + first push creates it.
            $this->resetWorkDir($dir);
            $this->git(['init', '-b', $branch], $dir);
            $this->git(['remote', 'add', 'origin', $remote], $dir);
        }
    }

    /**
     * Wipe a partial failed clone so init can start clean.
     */
    private function resetWorkDir(string $dir): void
    {
        if (! is_dir($dir)) {
            File::ensureDirectoryExists($dir);

            return;
        }

        File::cleanDirectory($dir);
    }

    public function writeFile(string $relativePath, string $contents): string
    {
        $absolute = $this->workDir().DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
        File::ensureDirectoryExists(dirname($absolute));
        File::put($absolute, $contents);

        return $absolute;
    }

    public function commitAndPush(string $message): void
    {
        $dir = $this->workDir();
        $this->git(['config', 'user.name', (string) config('git_export.commit_name')], $dir);
        $this->git(['config', 'user.email', (string) config('git_export.commit_email')], $dir);
        $this->git(['add', '-A'], $dir);

        $status = $this->git(['status', '--porcelain'], $dir);
        if (trim($status) === '') {
            return;
        }

        $this->git(['commit', '-m', $message], $dir);

        if (config('git_export.dry_run')) {
            return;
        }

        $branch = (string) config('git_export.branch', 'main');
        $this->git(['push', 'origin', 'HEAD:'.$branch], $dir);
    }

    /**
     * @param  list<string>  $args
     */
    private function git(array $args, string $cwd): string
    {
        $env = [];
        $keyPath = config('git_export.ssh_key_path');
        if (is_string($keyPath) && $keyPath !== '' && is_file($keyPath)) {
            $env['GIT_SSH_COMMAND'] = sprintf(
                'ssh -i %s -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new',
                escapeshellarg($keyPath),
            );
        }

        $result = Process::path($cwd)
            ->env($env)
            ->timeout(120)
            ->run(['git', ...$args]);

        if (! $result->successful()) {
            throw new RuntimeException(sprintf(
                'git %s failed (%s): %s',
                implode(' ', $args),
                $result->exitCode(),
                $result->errorOutput() !== '' ? $result->errorOutput() : $result->output(),
            ));
        }

        return $result->output();
    }
}
