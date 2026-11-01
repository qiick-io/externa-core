<?php

use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

it('deletes a collection through the row menu and confirm dialog', function (): void {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'name' => 'Delete Via Menu',
        'slug' => 'delete-via-menu',
    ]);

    $page = visit('/collections');

    $page->assertSee('Delete Via Menu')
        ->click('[data-test="collection-row-menu-'.$collection->id.'"]')
        ->wait(0.2)
        ->click('[data-test="collection-row-delete-'.$collection->id.'"]')
        ->wait(0.2)
        ->assertSee('Delete')
        ->click('[data-test="confirm-destructive"]')
        ->wait(0.5)
        ->assertDontSee('Delete Via Menu')
        ->assertNoJavaScriptErrors();
});
