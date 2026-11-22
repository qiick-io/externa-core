<?php

declare(strict_types=1);

use App\Models\ApiKey;
use App\Models\Role;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `api_keys.role_id` must refuse a role delete at the database when keys still reference it (#833).
 *
 * The suite already runs every migration (including the additive restrict change), so these
 * checks prove the live schema on the engine under test — SQLite in default Pest, and MySQL /
 * MariaDB / PostgreSQL through the CI engine jobs.
 */
test('deleting a role that API keys still reference fails at the database', function (): void {
    $role = Role::factory()->create(['name' => 'fk-restrict-'.uniqid()]);
    ApiKey::factory()->create(['role_id' => $role->id]);

    // Do not query after a failed DELETE on PostgreSQL: the wrapping RefreshDatabase
    // transaction is aborted (25P02) until it rolls back. The exception is the signal.
    expect(fn () => DB::table('roles')->where('id', $role->id)->delete())
        ->toThrow(QueryException::class);
});

test('a role with no API keys can still be deleted at the database', function (): void {
    $role = Role::factory()->create(['name' => 'fk-free-'.uniqid()]);

    expect(DB::table('roles')->where('id', $role->id)->delete())->toBe(1)
        ->and(DB::table('roles')->where('id', $role->id)->exists())->toBeFalse();
});

test('the restrictOnDelete migration reverses back to cascadeOnDelete', function (): void {
    $migration = require database_path('migrations/2026_11_22_094151_change_api_keys_role_id_to_restrict_on_delete.php');

    $migration->down();

    $role = Role::factory()->create(['name' => 'fk-cascade-'.uniqid()]);
    $apiKey = ApiKey::factory()->create(['role_id' => $role->id]);

    expect(DB::table('roles')->where('id', $role->id)->delete())->toBe(1)
        ->and(DB::table('roles')->where('id', $role->id)->exists())->toBeFalse()
        ->and(DB::table('api_keys')->where('id', $apiKey->id)->exists())->toBeFalse();

    $migration->up();

    // Fresh installs leave the column; SQLite rebuilds leave indexes intact.
    expect(Schema::hasColumn('api_keys', 'role_id'))->toBeTrue();
});
