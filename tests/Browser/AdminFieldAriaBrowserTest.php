<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

it('links role name field errors through aria-describedby', function () {
    $role = Role::query()->firstOrCreate([
        'name' => 'browser-roles-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
        'is_assignable' => true,
    ]);
    $role->syncPermissions([
        PermissionEnum::CanShowRoles->value,
        PermissionEnum::CanCreateRoles->value,
        PermissionEnum::CanEditRoles->value,
    ]);

    $actor = User::factory()->create();
    $actor->syncRoles([$role]);
    $this->actingAs($actor);

    $page = visit('/roles/create');

    $page->assertSee('New role')
        ->fill('#role_name', '')
        ->click('Create')
        ->wait(1.5)
        ->assertPresent('#role-name-error')
        ->assertScript(
            <<<'JS'
() => {
  const input = document.getElementById('role_name');
  const error = document.getElementById('role-name-error');
  if (!input || !error) {
    return false;
  }
  if (input.getAttribute('aria-invalid') !== 'true') {
    return false;
  }
  const describedBy = input.getAttribute('aria-describedby') || '';
  return describedBy.split(/\s+/).includes('role-name-error') && error.getAttribute('role') === 'alert';
}
JS
            ,
            true,
        )
        ->assertNoJavaScriptErrors();
});
