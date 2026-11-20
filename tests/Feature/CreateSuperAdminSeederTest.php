<?php

declare(strict_types=1);

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\CreateSuperAdminSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Hash;

beforeEach(function () {
    config([
        'super_admin.first_name' => 'Super',
        'super_admin.last_name' => 'Admin',
        'super_admin.email' => 'superadmin@example.com',
        'super_admin.password' => 'password',
    ]);
});

test('create super admin seeder creates a verified active user', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class, CreateSuperAdminSeeder::class]);

    $user = User::query()->where('email', config('super_admin.email'))->first();

    expect($user)->not->toBeNull()
        ->and($user->first_name)->toBe(config('super_admin.first_name'))
        ->and($user->email_verified_at)->not->toBeNull()
        ->and($user->is_active)->toBeTrue();

    expect(Hash::check(config('super_admin.password'), $user->password))->toBeTrue()
        ->and($user->hasRole(RoleEnum::SuperAdmin->value))->toBeTrue();
});

test('create super admin seeder is idempotent by email', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class, CreateSuperAdminSeeder::class]);
    $this->seed([PermissionSeeder::class, RoleSeeder::class, CreateSuperAdminSeeder::class]);

    expect(User::query()->where('email', config('super_admin.email'))->count())->toBe(1);
});

it('creates no user when db:seed runs outside local and testing with the default password', function (string $environment) {
    app()->detectEnvironment(fn (): string => $environment);

    $this->artisan('db:seed', ['--force' => true])->assertSuccessful();

    expect(User::query()->count())->toBe(0);
})->with(['production', 'staging']);

it('creates no user when the seeder is run explicitly in production with the default password', function () {
    app()->detectEnvironment(fn (): string => 'production');

    $this->artisan('db:seed', ['--class' => CreateSuperAdminSeeder::class, '--force' => true])
        ->expectsOutputToContain('Skipped the development super-admin')
        ->assertSuccessful();

    expect(User::query()->exists())->toBeFalse();
});

it('creates no user while INITIAL_SUPER_ADMIN_PASSWORD is empty', function (?string $password) {
    config(['super_admin.password' => $password]);

    $this->artisan('db:seed')->assertSuccessful();

    expect(User::query()->exists())->toBeFalse();
})->with(['empty' => [''], 'unset' => [null]]);

it('creates a super admin in production when a strong INITIAL_SUPER_ADMIN_PASSWORD is set', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    app()->detectEnvironment(fn (): string => 'production');
    config(['super_admin.password' => 'Password1']);

    $this->artisan('db:seed', ['--class' => CreateSuperAdminSeeder::class, '--force' => true])
        ->assertSuccessful();

    $user = User::query()->where('email', 'superadmin@example.com')->first();

    expect($user)->not->toBeNull()
        ->and(Hash::check('Password1', $user->password))->toBeTrue()
        ->and($user->hasRole(RoleEnum::SuperAdmin->value))->toBeTrue();
});

it('skips in production when INITIAL_SUPER_ADMIN_PASSWORD is the default password', function (string $password) {
    app()->detectEnvironment(fn (): string => 'production');
    config(['super_admin.password' => $password]);

    $this->artisan('db:seed', ['--class' => CreateSuperAdminSeeder::class, '--force' => true])
        ->expectsOutputToContain('Skipped the development super-admin')
        ->assertSuccessful();

    expect(User::query()->exists())->toBeFalse();
})->with(['password', 'Password', 'PASSWORD']);

it('skips in production when INITIAL_SUPER_ADMIN_PASSWORD is too weak', function () {
    app()->detectEnvironment(fn (): string => 'production');
    // Below Password::defaults() (project policy floor is min 6 in tests).
    config(['super_admin.password' => 'Ab1']);

    $this->artisan('db:seed', ['--class' => CreateSuperAdminSeeder::class, '--force' => true])
        ->expectsOutputToContain('Skipped the development super-admin')
        ->assertSuccessful();

    expect(User::query()->exists())->toBeFalse();
});

it('skips in production when INITIAL_SUPER_ADMIN_PASSWORD is empty', function () {
    app()->detectEnvironment(fn (): string => 'production');
    config(['super_admin.password' => '']);

    $this->artisan('db:seed', ['--class' => CreateSuperAdminSeeder::class, '--force' => true])
        ->expectsOutputToContain('Skipped the development super-admin')
        ->assertSuccessful();

    expect(User::query()->exists())->toBeFalse();
});

it('does not modify an existing admin on re-seed', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $existing = User::factory()->create([
        'email' => 'superadmin@example.com',
        'first_name' => 'Existing',
        'last_name' => 'Operator',
        'password' => 'original-secret-password',
        'is_active' => false,
        'email_verified_at' => null,
    ]);
    $existing->assignRole(RoleEnum::Admin->value);

    $this->seed(CreateSuperAdminSeeder::class);

    $existing->refresh();

    expect($existing->first_name)->toBe('Existing')
        ->and($existing->last_name)->toBe('Operator')
        ->and($existing->is_active)->toBeFalse()
        ->and($existing->email_verified_at)->toBeNull()
        ->and(Hash::check('original-secret-password', $existing->password))->toBeTrue()
        ->and($existing->hasRole(RoleEnum::Admin->value))->toBeTrue()
        ->and($existing->hasRole(RoleEnum::SuperAdmin->value))->toBeFalse();
});

it('does not modify an existing admin on re-seed in production with a strong password', function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $existing = User::factory()->create([
        'email' => 'superadmin@example.com',
        'first_name' => 'Existing',
        'password' => 'original-secret-password',
        'is_active' => false,
        'email_verified_at' => null,
    ]);
    $existing->assignRole(RoleEnum::Admin->value);

    app()->detectEnvironment(fn (): string => 'production');
    config(['super_admin.password' => 'Password1']);

    $this->artisan('db:seed', ['--class' => CreateSuperAdminSeeder::class, '--force' => true])
        ->assertSuccessful();

    $existing->refresh();

    expect($existing->first_name)->toBe('Existing')
        ->and($existing->is_active)->toBeFalse()
        ->and(Hash::check('original-secret-password', $existing->password))->toBeTrue()
        ->and($existing->hasRole(RoleEnum::SuperAdmin->value))->toBeFalse();
});

it('ships config without a default password', function () {
    $configSource = file_get_contents(base_path('config/super_admin.php'));

    expect($configSource)->toMatch("/env\\('INITIAL_SUPER_ADMIN_PASSWORD'\\)/")
        ->and($configSource)->not->toMatch("/env\\('INITIAL_SUPER_ADMIN_PASSWORD',\\s*'password'\\)/");
});
