<?php

use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
});

it('opens preview-as-role with a full-width select and human role labels', function () {
    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'name' => 'Preview Sink',
        'slug' => 'preview-sink',
        'is_singleton' => false,
    ]);
    CollectionField::factory()->for($collection)->create([
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([]);

    $page = visit(route('collections.items.show', [$collection, $item], false));

    $page->assertNoJavaScriptErrors()
        ->click('[data-test="preview-as-role"]')
        ->wait(0.4)
        ->assertSee('Preview as role')
        ->click('#preview-role')
        ->wait(0.3)
        ->assertSee('Reader')
        ->assertSee('Public')
        ->assertSee('Admin')
        ->assertDontSee('super-admin')
        ->assertDontSee('public (public)')
        ->assertNoJavaScriptErrors();
});
