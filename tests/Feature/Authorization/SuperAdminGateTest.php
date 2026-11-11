<?php

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Api\ApiAccess;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Inertia\Testing\AssertableInertia;

/**
 * Test-only policy: denies every ability, as "not found" for view.
 */
final class DenyingSettingPolicy
{
    public function view(?User $user, Setting $setting): Response
    {
        return Response::denyAsNotFound();
    }

    public function update(?User $user, ?Setting $setting = null): bool
    {
        return false;
    }
}

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);

    $this->superAdmin = User::factory()->create();
    $this->superAdmin->assignRole(RoleEnum::SuperAdmin->value);
});

test('super admin bypasses gate checks', function () {
    expect(Gate::forUser($this->superAdmin)->allows(PermissionEnum::CanDeleteUsers->value))->toBeTrue()
        ->and(Gate::forUser($this->superAdmin)->allows('non-existent-ability'))->toBeTrue();
});

test('model policies decide for super admins too', function () {
    Gate::policy(Setting::class, DenyingSettingPolicy::class);

    expect(Gate::forUser($this->superAdmin)->allows('update', new Setting))->toBeFalse()
        ->and(Gate::forUser($this->superAdmin)->allows('update', Setting::class))->toBeFalse();
});

test('super admin does not bypass the gate for an api actor', function () {
    request()->attributes->set('apiAccess', new ApiAccess('api_key', Role::factory()->create()));

    expect(Gate::forUser($this->superAdmin)->allows('non-existent-ability'))->toBeFalse();
});

test('a policy deny as not found renders the web 404 page', function () {
    Gate::policy(Setting::class, DenyingSettingPolicy::class);
    Route::middleware(['web', 'auth'])->get('/__test/policy-404', function () {
        Gate::authorize('view', new Setting);
    });

    $this->withoutVite()
        ->actingAs($this->superAdmin)
        ->get('/__test/policy-404')
        ->assertNotFound()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('errors/not-found')
            ->where('status', 404));
});

test('a policy deny as not found stays a json 404 for json requests', function () {
    Gate::policy(Setting::class, DenyingSettingPolicy::class);
    Route::middleware(['web', 'auth'])->get('/__test/policy-404', function () {
        Gate::authorize('view', new Setting);
    });

    $this->actingAs($this->superAdmin)
        ->getJson('/__test/policy-404')
        ->assertNotFound()
        ->assertJsonMissingPath('component');
});
