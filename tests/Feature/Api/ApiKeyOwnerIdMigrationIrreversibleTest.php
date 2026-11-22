<?php

declare(strict_types=1);

use App\Exceptions\IrreversibleMigrationException;
use App\Models\ApiKey;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Rolling back the owner_id migration would erase every recorded API key owner (#833 / 1.5.1).
 * up() stays the v1.5.0 body; only down() may change.
 */
test('owner_id migration up() source matches the v1.5.0 hash', function (): void {
    $migrationSource = (string) file_get_contents(
        database_path('migrations/2026_10_31_135404_add_owner_id_to_api_keys_table.php'),
    );

    expect(preg_match('/public function up\(\): void\n    \{.*?\n    \}/s', $migrationSource, $matches))
        ->toBe(1)
        ->and(hash('sha256', $matches[0]))
        ->toBe('1eb7bb814204dbf6493f4ee07cb0529d2207e651f27f6e5474822b6491654c58');
});

test('owner_id migration down() throws and leaves owner_id intact', function (): void {
    $owner = User::factory()->create();
    $apiKey = ApiKey::factory()->create(['owner_id' => $owner->id]);

    $migration = require database_path('migrations/2026_10_31_135404_add_owner_id_to_api_keys_table.php');

    expect(fn () => $migration->down())
        ->toThrow(
            IrreversibleMigrationException::class,
            'This migration cannot be rolled back: it would erase every recorded API key owner. Restore the pre-upgrade backup instead.',
        )
        ->and(Schema::hasColumn('api_keys', 'owner_id'))->toBeTrue()
        ->and(DB::table('api_keys')->where('id', $apiKey->id)->value('owner_id'))->toBe($owner->id);
});
