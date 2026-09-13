<?php

use App\Models\User;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
});

test('guests cannot search demo cities', function () {
    $this->get('/demo/cities?q=mil')->assertRedirect(route('login'));
});

test('authenticated users can search demo cities', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->getJson('/demo/cities?q=mil')
        ->assertOk()
        ->assertJsonPath('data.0.value', 'milan')
        ->assertJsonPath('data.0.label', 'Milan, Italy');

    $this->getJson('/demo/cities?q=zzzz')
        ->assertOk()
        ->assertJsonPath('data', []);
});
