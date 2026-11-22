<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Api\UserRelationColumnService;
use App\Services\Users\UserPublicIdBackfillService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

test('users:backfill-public-id dry-run reports zero when every user has a public_id', function (): void {
    expect(app(UserPublicIdBackfillService::class)->missingCount())->toBe(0);
    expect(Artisan::call('users:backfill-public-id', ['--dry-run' => true]))->toBe(0);
    expect(Artisan::output())->toContain('[dry-run] users missing public_id: 0');
});

test('users:backfill-public-id dry-run counts every user when the column is missing', function (): void {
    User::factory()->count(3)->create();

    Schema::table('users', function ($table): void {
        if (Schema::hasIndex('users', 'users_public_id_unique')) {
            $table->dropUnique(['public_id']);
        }
    });
    Schema::table('users', function ($table): void {
        $table->dropColumn('public_id');
    });
    app(UserRelationColumnService::class)->forgetPublicIdColumnCache();

    $expected = (int) User::query()->count();

    expect(app(UserPublicIdBackfillService::class)->missingCount())->toBe($expected);
    expect(Artisan::call('users:backfill-public-id', ['--dry-run' => true]))->toBe(0);
    expect(Artisan::output())->toContain("[dry-run] users missing public_id: {$expected}");

    /** @var object{up(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_120000_add_public_id_to_users_table.php');
    $migration->up();
    app(UserRelationColumnService::class)->forgetPublicIdColumnCache();
});
