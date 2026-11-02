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

it('shows the collection name and slug in one combined cell', function (): void {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    Collection::factory()->create([
        'name' => 'Combined Cell',
        'slug' => 'combined-cell',
    ]);

    $page = visit('/collections');

    $page->assertSee('Combined Cell')
        ->assertScript("document.querySelectorAll('thead th').length === 4")
        ->assertScript("document.querySelector('tbody tr td:nth-child(2)').textContent.includes('combined-cell')")
        ->assertNoJavaScriptErrors();
});
