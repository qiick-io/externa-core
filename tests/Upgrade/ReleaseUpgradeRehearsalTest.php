<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Tests\Support\ReleaseUpgradeFixtures;

/**
 * Rehearses the upgrade from the last release tag on the configured database (#792).
 *
 * The schema is built from the tag's own `database/migrations/` (taken with `git archive`, the
 * working tree is not touched), populated with {@see ReleaseUpgradeFixtures}, then this branch's
 * migrations run on it. The checks are the invariants the fixtures define: no row lost, nothing
 * rewritten that a migration does not promise to rewrite, translations as documented.
 *
 * Not part of the default suites: it rebuilds the database with `migrate:fresh` and runs git,
 * so CI calls it on each engine in full mode only (`upgrade-rehearsal` in tests.yml). Locally:
 * `DB_CONNECTION=pgsql DB_DATABASE=externa_core … vendor/bin/pest tests/Upgrade`.
 */
function lastReleaseTag(): string
{
    foreach (['origin/main', 'main'] as $mainRef) {
        $describe = Process::path(base_path())->run(['git', 'describe', '--tags', '--abbrev=0', '--match', 'v*', $mainRef]);

        if ($describe->successful()) {
            return trim($describe->output());
        }
    }

    throw new RuntimeException('No v* release tag reachable from main: fetch main and the tags first.');
}

/**
 * @return list<string> migration names (no `.php`) in the directory
 */
function migrationNames(string $migrationsDirectory): array
{
    return collect(File::files($migrationsDirectory))
        ->map(fn (SplFileInfo $migrationFile): string => $migrationFile->getBasename('.php'))
        ->sort()
        ->values()
        ->all();
}

test('a populated install of the last release upgrades without losing or rewriting data', function () {
    $releaseTag = lastReleaseTag();
    $releaseTree = sys_get_temp_dir().'/externa-release-'.bin2hex(random_bytes(4));
    File::ensureDirectoryExists($releaseTree);

    try {
        Process::path(base_path())
            ->run('git archive '.escapeshellarg($releaseTag).' database/migrations | tar -x -C '.escapeshellarg($releaseTree))
            ->throw();

        $releaseMigrationsDirectory = $releaseTree.'/database/migrations';
        $pendingMigrations = array_values(array_diff(
            migrationNames(database_path('migrations')),
            migrationNames($releaseMigrationsDirectory),
        ));

        Artisan::call('migrate:fresh', ['--path' => $releaseMigrationsDirectory, '--realpath' => true, '--force' => true]);
        $snapshot = ReleaseUpgradeFixtures::seed($pendingMigrations);

        expect(Artisan::call('migrate', ['--force' => true]))->toBe(0, Artisan::output());
    } finally {
        File::deleteDirectory($releaseTree);
    }

    fwrite(STDERR, sprintf(
        "\n  Upgrade from %s on %s: %d pending migration(s), fixtures for %s.\n",
        $releaseTag,
        DB::getDriverName(),
        count($pendingMigrations),
        $snapshot['seededGroups'] === [] ? 'none' : implode(', ', $snapshot['seededGroups']),
    ));

    expect(ReleaseUpgradeFixtures::violations($snapshot))->toBe([]);
});
