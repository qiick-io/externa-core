<?php

use App\Enums\PermissionEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

it('links collection drawer name errors through aria-describedby', function () {
    $role = Role::query()->firstOrCreate([
        'name' => 'browser-collections-'.uniqid(),
        'guard_name' => config('auth.defaults.guard', 'web'),
        'is_assignable' => true,
    ]);
    $role->syncPermissions([
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);

    $actor = User::factory()->create();
    $actor->syncRoles([$role]);
    $this->actingAs($actor);

    $page = visit('/collections');

    $page->assertSee('Collections')
        ->click('New collection')
        ->wait(0.5)
        ->assertSee('Name')
        ->fill('#collection_drawer_name', '')
        ->click('Create')
        ->wait(1.5)
        ->assertPresent('#collection-drawer-name-error')
        ->assertScript(
            <<<'JS'
() => {
  const input = document.getElementById('collection_drawer_name');
  const error = document.getElementById('collection-drawer-name-error');
  if (!input || !error) return false;
  if (input.getAttribute('aria-invalid') !== 'true') return false;
  const describedBy = input.getAttribute('aria-describedby') || '';
  return describedBy.split(/\s+/).includes('collection-drawer-name-error') && error.getAttribute('role') === 'alert';
}
JS
            ,
            true,
        )
        ->assertNoJavaScriptErrors();
});
