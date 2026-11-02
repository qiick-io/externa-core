<?php

use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);
});

it('shows the users trash empty state and hides the list toolbar', function (): void {
    $page = visit('/users?trashed=1');

    $page->assertSee('Trash is empty')
        ->assertNoJavascriptErrors();

    $page->assertMissing('Search trash…');
});

it('shows the filtered users empty state with a clear filters action', function (): void {
    $page = visit('/users?search=no-such-user-anywhere');

    $page->assertSee('No users found')
        ->assertSee('Clear filters')
        ->assertNoJavascriptErrors();
});

it('shows the items empty state CTA and hides the list toolbar', function (): void {
    $collection = Collection::factory()->create();

    $page = visit("/collections/{$collection->id}/items");

    $page->assertSee('No items yet')
        ->assertSee('Create your first item')
        ->assertNoJavascriptErrors();

    $page->assertMissing('Search title…');
});

it('opens the create dialog from the API keys empty state', function (): void {
    $page = visit('/settings/api-keys');

    $page->assertSee('No API keys yet')
        ->click('[data-slot="empty"] button')
        ->assertVisible('[role="dialog"]')
        ->assertNoJavascriptErrors();
});

it('shows the role collections empty state with a link to collections', function (): void {
    $page = visit('/settings/roles/create');

    $page->assertSee('Create a collection first, then grant this role access to it.')
        ->assertSee('Go to collections')
        ->assertNoJavascriptErrors();
});
