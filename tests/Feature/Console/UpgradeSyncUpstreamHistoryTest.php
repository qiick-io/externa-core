<?php

declare(strict_types=1);

use App\Console\Commands\UpgradeCommand;
use App\Services\Upgrade\UpgradeGitService;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;

/**
 * `externa:upgrade --sync-upstream` on a `composer create-project` install (#768), run against
 * real throwaway git repositories: an "upstream" with release tags, and an install whose first
 * commit is a copy of v1.0.0's files with no shared history, as create-project leaves it.
 * Everything stays on the local disk: the upstream remote is a file path, never the network.
 */
beforeEach(function () {
    $this->sandboxPath = sys_get_temp_dir().'/externa-upgrade-sync-'.bin2hex(random_bytes(6));
    $this->upstreamPath = $this->sandboxPath.'/upstream';
    $this->installPath = $this->sandboxPath.'/install';

    initializeSandboxRepository($this->upstreamPath);
    File::put($this->upstreamPath.'/README.md', "Externa\n");
    File::put($this->upstreamPath.'/routes.php', "release one\n");
    sandboxGit($this->upstreamPath, ['add', '--all']);
    sandboxGit($this->upstreamPath, ['commit', '-m', 'release v1.0.0']);
    sandboxGit($this->upstreamPath, ['tag', 'v1.0.0']);

    initializeSandboxRepository($this->installPath);
    File::copy($this->upstreamPath.'/README.md', $this->installPath.'/README.md');
    File::copy($this->upstreamPath.'/routes.php', $this->installPath.'/routes.php');

    File::put($this->upstreamPath.'/routes.php', "release two\n");
    sandboxGit($this->upstreamPath, ['commit', '--all', '-m', 'release v1.1.0']);
    sandboxGit($this->upstreamPath, ['tag', 'v1.1.0']);

    sandboxGit($this->installPath, ['add', '--all']);
    sandboxGit($this->installPath, ['commit', '-m', 'initial install']);
    File::put($this->installPath.'/site.php', "our own page\n");
    File::put($this->installPath.'/README.md', "Externa\nOur site.\n");
    sandboxGit($this->installPath, ['add', '--all']);
    sandboxGit($this->installPath, ['commit', '-m', 'customize the site']);
    sandboxGit($this->installPath, ['remote', 'add', UpgradeCommand::UPSTREAM_REMOTE, $this->upstreamPath]);

    $this->app->instance(UpgradeGitService::class, new UpgradeGitService($this->installPath));
    config(['app.version' => '1.0.0']);
});

afterEach(function () {
    File::deleteDirectory($this->sandboxPath);
});

it('links the unrelated histories at the installed tag, then merges the target release', function () {
    $this->artisan(UpgradeCommand::class, syncOptions('v1.1.0'))
        ->expectsOutputToContain('shares no history with upstream')
        ->expectsOutputToContain('Linked upstream history at v1.0.0')
        ->expectsOutputToContain('Synced from upstream tag v1.1.0')
        ->assertSuccessful();

    expect(File::get($this->installPath.'/routes.php'))->toBe("release two\n")
        ->and(File::get($this->installPath.'/README.md'))->toBe("Externa\nOur site.\n")
        ->and(File::get($this->installPath.'/site.php'))->toBe("our own page\n")
        ->and(sandboxGit($this->installPath, ['status', '--porcelain']))->toBe('')
        ->and(sandboxGit($this->installPath, ['log', '--merges', '--format=%s']))
        ->toContain('chore: link upstream history at v1.0.0');

    sandboxGit($this->installPath, ['merge-base', '--is-ancestor', 'v1.1.0', 'HEAD']);
});

it('needs no linking on the next sync once the histories share a merge base', function () {
    $this->artisan(UpgradeCommand::class, syncOptions('v1.1.0'))->assertSuccessful();

    File::put($this->upstreamPath.'/routes.php', "release three\n");
    sandboxGit($this->upstreamPath, ['commit', '--all', '-m', 'release v1.2.0']);
    sandboxGit($this->upstreamPath, ['tag', 'v1.2.0']);
    config(['app.version' => '1.1.0']);

    $this->artisan(UpgradeCommand::class, syncOptions('v1.2.0'))
        ->doesntExpectOutputToContain('shares no history with upstream')
        ->expectsOutputToContain('Synced from upstream tag v1.2.0')
        ->assertSuccessful();

    $linkCommitSubjects = array_filter(
        explode("\n", sandboxGit($this->installPath, ['log', '--format=%s'])),
        fn (string $subject): bool => str_starts_with($subject, 'chore: link upstream history'),
    );

    expect(File::get($this->installPath.'/routes.php'))->toBe("release three\n")
        ->and(File::get($this->installPath.'/site.php'))->toBe("our own page\n")
        ->and($linkCommitSubjects)->toHaveCount(1);
});

it('shows the linking step and the upstream changes on a dry run without committing', function () {
    $headBeforeDryRun = sandboxGit($this->installPath, ['rev-parse', 'HEAD']);

    $this->artisan(UpgradeCommand::class, [...syncOptions('v1.1.0'), '--dry-run' => true])
        ->expectsOutputToContain('Would first link the histories at the installed version')
        ->expectsOutputToContain('git merge -s ours --allow-unrelated-histories -m "chore: link upstream history at v1.0.0" v1.0.0')
        ->expectsOutputToContain('1 file(s) would change relative to v1.1.0')
        ->expectsOutputToContain('Dry-run only')
        ->assertSuccessful();

    expect(sandboxGit($this->installPath, ['rev-parse', 'HEAD']))->toBe($headBeforeDryRun);
});

it('stops with the manual link command when the installed version has no upstream tag', function () {
    config(['app.version' => '1.5.0-dev']);
    $headBeforeSync = sandboxGit($this->installPath, ['rev-parse', 'HEAD']);

    $this->artisan(UpgradeCommand::class, syncOptions('v1.1.0'))
        ->expectsOutputToContain('the installed version (1.5.0-dev) has no matching tag v1.5.0-dev')
        ->expectsOutputToContain('git merge -s ours --allow-unrelated-histories')
        ->assertFailed();

    expect(sandboxGit($this->installPath, ['rev-parse', 'HEAD']))->toBe($headBeforeSync);
});

/**
 * @return array<string, bool|string>
 */
function syncOptions(string $targetTag): array
{
    return [
        '--sync-upstream' => $targetTag,
        '--yes' => true,
        '--no-migrate' => true,
        '--no-permissions' => true,
    ];
}

/**
 * A fresh repository with its own identity, unsigned commits and no hooks, so the test does
 * not depend on (or touch) the machine's global git configuration.
 */
function initializeSandboxRepository(string $repositoryPath): void
{
    File::ensureDirectoryExists($repositoryPath);
    sandboxGit($repositoryPath, ['init', '--quiet', '--initial-branch=main']);
    sandboxGit($repositoryPath, ['config', 'user.name', 'Externa Test']);
    sandboxGit($repositoryPath, ['config', 'user.email', 'test@example.com']);
    sandboxGit($repositoryPath, ['config', 'commit.gpgsign', 'false']);
    sandboxGit($repositoryPath, ['config', 'core.hooksPath', '/dev/null']);
}

/**
 * Runs git in the sandbox and fails the test on a non-zero exit.
 *
 * @param  list<string>  $arguments
 */
function sandboxGit(string $repositoryPath, array $arguments): string
{
    $result = Process::path($repositoryPath)->run(['git', ...$arguments]);

    expect($result->successful())->toBeTrue('git '.implode(' ', $arguments).' failed: '.$result->errorOutput());

    return trim($result->output());
}
