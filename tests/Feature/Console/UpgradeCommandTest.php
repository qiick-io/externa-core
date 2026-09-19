<?php

use App\Console\Commands\UpgradeCommand;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Process;

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

it('refuses --dry-run without --sync-upstream', function () {
    $this->artisan(UpgradeCommand::class, [
        '--dry-run' => true,
        '--no-migrate' => true,
        '--no-permissions' => true,
    ])
        ->expectsOutputToContain('--dry-run requires --sync-upstream')
        ->assertFailed();
});

it('refuses --sync-upstream when not a git repository', function () {
    fakeGit([
        'rev-parse --is-inside-work-tree' => Process::result(output: "false\n", exitCode: 128),
    ]);

    $this->artisan(UpgradeCommand::class, [
        '--sync-upstream' => 'v1.0.0',
        '--dry-run' => true,
        '--no-migrate' => true,
        '--no-permissions' => true,
    ])
        ->expectsOutputToContain('not a git repository')
        ->assertFailed();
});

it('refuses --sync-upstream on dirty tree without --force', function () {
    fakeGit([
        'rev-parse --is-inside-work-tree' => Process::result("true\n"),
        'status --porcelain' => Process::result(" M app/Foo.php\n"),
    ]);

    $this->artisan(UpgradeCommand::class, [
        '--sync-upstream' => 'v1.0.0',
        '--dry-run' => true,
        '--no-migrate' => true,
        '--no-permissions' => true,
    ])
        ->expectsOutputToContain('Git working tree is dirty')
        ->assertFailed();
});

it('dry-runs --sync-upstream and lists changing files without merging', function () {
    fakeGit([
        'rev-parse --is-inside-work-tree' => Process::result("true\n"),
        'status --porcelain' => Process::result(''),
        'remote' => Process::result("origin\nupstream\n"),
        'fetch --tags upstream' => Process::result(''),
        'rev-parse --verify refs/tags/v1.0.0' => Process::result("abc123\n"),
        'diff --name-status HEAD v1.0.0' => Process::result("M\tREADME.md\nA\tapp/New.php\n"),
    ]);

    $this->artisan(UpgradeCommand::class, [
        '--sync-upstream' => 'v1.0.0',
        '--dry-run' => true,
        '--no-migrate' => true,
        '--no-permissions' => true,
    ])
        ->expectsOutputToContain('2 file(s) would change')
        ->expectsOutputToContain('Dry-run only')
        ->assertSuccessful();

    Process::assertRanTimes(fn (PendingProcess $process) => implode(' ', gitArgs($process)) === 'merge --no-edit v1.0.0', 0);
});

it('applies --sync-upstream merge with --yes then continues upgrade subset', function () {
    fakeGit([
        'rev-parse --is-inside-work-tree' => Process::result("true\n"),
        'status --porcelain' => Process::result(''),
        'remote' => Process::result("origin\n"),
        'remote add upstream https://github.com/qiick-io/externa-core.git' => Process::result(''),
        'fetch --tags upstream' => Process::result(''),
        'rev-parse --verify refs/tags/v1.0.0' => Process::result("abc123\n"),
        'diff --name-status HEAD v1.0.0' => Process::result("M\tREADME.md\n"),
        'merge --no-edit v1.0.0' => Process::result("Merge made\n"),
    ]);

    $this->artisan(UpgradeCommand::class, [
        '--sync-upstream' => 'v1.0.0',
        '--yes' => true,
        '--no-migrate' => true,
        '--no-permissions' => true,
    ])
        ->expectsOutputToContain('Synced from upstream tag v1.0.0')
        ->expectsOutputToContain('Automated subset done')
        ->assertSuccessful();
});

it('aborts apply when confirm is declined', function () {
    fakeGit([
        'rev-parse --is-inside-work-tree' => Process::result("true\n"),
        'status --porcelain' => Process::result(''),
        'remote' => Process::result("origin\nupstream\n"),
        'fetch --tags upstream' => Process::result(''),
        'rev-parse --verify refs/tags/v1.0.0' => Process::result("abc123\n"),
        'diff --name-status HEAD v1.0.0' => Process::result("M\tREADME.md\n"),
    ]);

    $this->artisan(UpgradeCommand::class, [
        '--sync-upstream' => 'v1.0.0',
        '--no-migrate' => true,
        '--no-permissions' => true,
    ])
        ->expectsConfirmation('1 files will be overwritten / changed — proceed with caution?', 'no')
        ->expectsOutputToContain('Aborted')
        ->assertFailed();

    Process::assertRanTimes(fn (PendingProcess $process) => implode(' ', gitArgs($process)) === 'merge --no-edit v1.0.0', 0);
});

it('fails clearly when merge conflicts', function () {
    fakeGit([
        'rev-parse --is-inside-work-tree' => Process::result("true\n"),
        'status --porcelain' => Process::result(''),
        'remote' => Process::result("origin\nupstream\n"),
        'fetch --tags upstream' => Process::result(''),
        'rev-parse --verify refs/tags/v1.0.0' => Process::result("abc123\n"),
        'diff --name-status HEAD v1.0.0' => Process::result("M\tREADME.md\n"),
        'merge --no-edit v1.0.0' => Process::result(
            output: "CONFLICT (content): Merge conflict in README.md\n",
            errorOutput: "Automatic merge failed; fix conflicts and then commit the result.\n",
            exitCode: 1,
        ),
    ]);

    $this->artisan(UpgradeCommand::class, [
        '--sync-upstream' => 'v1.0.0',
        '--yes' => true,
        '--no-migrate' => true,
        '--no-permissions' => true,
    ])
        ->expectsOutputToContain('Merge failed')
        ->assertFailed();
});

/**
 * @param  array<string, ProcessResult>  $map
 */
function fakeGit(array $map): void
{
    Process::preventStrayProcesses();
    Process::fake(function (PendingProcess $process) use ($map) {
        $key = implode(' ', gitArgs($process));

        if (! array_key_exists($key, $map)) {
            throw new RuntimeException('Unexpected git invocation: git '.$key);
        }

        return $map[$key];
    });
}

/**
 * @return list<string>
 */
function gitArgs(PendingProcess $process): array
{
    $command = $process->command;

    if (is_string($command)) {
        $parts = preg_split('/\s+/', trim($command)) ?: [];

        return array_values(array_slice($parts, 1));
    }

    expect($command[0] ?? null)->toBe('git');

    return array_values(array_slice($command, 1));
}
