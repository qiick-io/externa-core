<?php

declare(strict_types=1);

/**
 * Seeds an installed Externa tree with the upgrade fixtures, or checks them after the upgrade,
 * for scripts/e2e/install-upgrade.sh (#794). The fixtures and invariants are the ones the Pest
 * rehearsal uses: tests/Support/ReleaseUpgradeFixtures.php.
 *
 * The class is loaded from this checkout by path and runs inside the target tree's Laravel, so
 * the same definition seeds the previous release and checks this one.
 *
 * Usage:
 *   php scripts/e2e/upgrade-fixtures.php seed <app-dir> <snapshot.json> <pending-migration>...
 *   php scripts/e2e/upgrade-fixtures.php verify <app-dir> <snapshot.json>
 */

use Illuminate\Contracts\Console\Kernel;
use Tests\Support\ReleaseUpgradeFixtures;

[, $command, $applicationDirectory, $snapshotPath] = array_pad($argv, 4, null);
$pendingMigrations = array_slice($argv, 4);

if (! in_array($command, ['seed', 'verify'], true) || $applicationDirectory === null || $snapshotPath === null) {
    fwrite(STDERR, "Usage: upgrade-fixtures.php seed|verify <app-dir> <snapshot.json> [pending-migration...]\n");
    exit(2);
}

require $applicationDirectory.'/vendor/autoload.php';
$application = require $applicationDirectory.'/bootstrap/app.php';
$application->make(Kernel::class)->bootstrap();

require_once __DIR__.'/../../tests/Support/ReleaseUpgradeFixtures.php';

if ($command === 'seed') {
    $snapshot = ReleaseUpgradeFixtures::seed(array_values($pendingMigrations));
    file_put_contents($snapshotPath, json_encode($snapshot, JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR));
    $seededGroups = $snapshot['seededGroups'];
    echo 'Seeded fixtures for: '.($seededGroups === [] ? 'none (no pending data migration)' : implode(', ', $seededGroups)).PHP_EOL;

    exit(0);
}

$snapshot = json_decode((string) file_get_contents($snapshotPath), true, flags: JSON_THROW_ON_ERROR);
$violations = ReleaseUpgradeFixtures::violations($snapshot);

foreach ($violations as $violation) {
    fwrite(STDERR, 'VIOLATION: '.$violation.PHP_EOL);
}

$checkedRows = array_sum(array_map(fn (array $table): int => count($table['rows']), $snapshot['tables']));
echo sprintf('Checked %d row(s) in %d table(s): %d violation(s).', $checkedRows, count($snapshot['tables']), count($violations)).PHP_EOL;

exit($violations === [] ? 0 : 1);
