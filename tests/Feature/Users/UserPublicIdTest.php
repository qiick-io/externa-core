<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Http\Middleware\EmitBigintUserIdDeprecationHeadersMiddleware;
use App\Models\User;
use App\Services\Api\MiniUserMapperService;
use App\Services\Api\UserRelationColumnService;
use App\Services\Users\UserPublicIdBackfillService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

/**
 * Fleet users baseline: public_id UUID v7 is the external id; PK stays bigint (#827 step 2).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
});

test('users table has a unique non-null public_id column', function (): void {
    expect(Schema::hasColumn('users', 'public_id'))->toBeTrue();

    $user = User::factory()->create();

    expect(Str::isUuid($user->public_id))->toBeTrue()
        ->and(strlen($user->public_id))->toBe(36)
        ->and($user->getKey())->toBeInt();
});

test('new users receive a uuid v7 public_id on create', function (): void {
    $user = User::factory()->create();

    expect(Str::isUuid($user->fresh()->public_id))->toBeTrue();
});

test('backfill is a no-op when every user already has a public_id', function (): void {
    User::factory()->count(2)->create();

    expect(app(UserPublicIdBackfillService::class)->missingCount())->toBe(0)
        ->and(app(UserPublicIdBackfillService::class)->backfill())->toBe(0);
});

test('route binding accepts public_id uuid as well as the bigint id', function (): void {
    $role = Role::query()->create([
        'name' => 'public-id-editor-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
    ]);
    $role->syncPermissions([PermissionEnum::CanEditUsers->value]);

    $actor = User::factory()->create();
    $actor->syncRoles([$role]);
    $target = User::factory()->create(['first_name' => 'Original']);

    $this->actingAs($actor)
        ->put(route('users.update', $target->public_id), [
            'first_name' => 'Renamed',
        ])
        ->assertRedirect(route('users.index'));

    expect($target->fresh()->first_name)->toBe('Renamed');

    $this->actingAs($actor)
        ->put(route('users.update', $target->id), [
            'first_name' => 'ById',
        ])
        ->assertRedirect(route('users.index'));

    expect($target->fresh()->first_name)->toBe('ById');
});

test('public_id migration is re-runnable after a partial apply', function (): void {
    if (Schema::hasIndex('users', 'users_public_id_unique')) {
        Schema::table('users', function ($table): void {
            $table->dropUnique(['public_id']);
        });
    }

    expect(Schema::hasColumn('users', 'public_id'))->toBeTrue()
        ->and(Schema::hasIndex('users', 'users_public_id_unique'))->toBeFalse();

    /** @var object{up(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_120000_add_public_id_to_users_table.php');
    $migration->up();

    expect(Schema::hasIndex('users', 'users_public_id_unique'))->toBeTrue();

    $migration->up();
    expect(Schema::hasIndex('users', 'users_public_id_unique'))->toBeTrue()
        ->and(Schema::hasColumn('users', 'public_id'))->toBeTrue();
});

test('eager loads tolerate a missing public_id column during the deploy window', function (): void {
    $user = User::factory()->create();

    Schema::table('users', function ($table): void {
        if (Schema::hasIndex('users', 'users_public_id_unique')) {
            $table->dropUnique(['public_id']);
        }
    });
    Schema::table('users', function ($table): void {
        $table->dropColumn('public_id');
    });
    UserRelationColumnService::forgetPublicIdColumnCache();

    $select = app(UserRelationColumnService::class)->selectList();
    expect($select)->not->toContain('public_id');

    $loaded = User::query()->select(explode(',', $select))->findOrFail($user->id);
    expect(app(MiniUserMapperService::class)->toArray($loaded))
        ->toMatchArray(['id' => $user->id, 'public_id' => '']);

    /** @var object{up(): void} $migration */
    $migration = require database_path('migrations/2026_11_20_120000_add_public_id_to_users_table.php');
    $migration->up();
    UserRelationColumnService::forgetPublicIdColumnCache();
});

test('public api v1 responses emit Deprecation Sunset and Link headers', function (): void {
    $response = $this->getJson('/api/v1/collections');

    $response->assertOk()
        ->assertHeader('Deprecation', 'true')
        ->assertHeader('Sunset', EmitBigintUserIdDeprecationHeadersMiddleware::SUNSET_HTTP_DATE);

    expect($response->headers->get('Link'))
        ->toContain('rel="deprecation"')
        ->toContain('users-public-id');
});

test('cors exposes deprecation and rate-limit headers', function (): void {
    $exposed = config('cors.exposed_headers');

    foreach ([
        'X-Request-Id',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After',
        'Deprecation',
        'Sunset',
        'Content-Language',
        'Link',
    ] as $header) {
        expect($exposed)->toContain($header);
    }
});
