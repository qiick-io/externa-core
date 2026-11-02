<?php

use App\Enums\RoleEnum;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

it('shows the empty collections CTA and hides the list toolbar', function (): void {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $page = visit('/collections');

    $page->assertSee('No collections yet')
        ->assertSee('Create your first collection')
        ->assertNoJavascriptErrors();

    $page->assertMissing('Search collections…');
});
