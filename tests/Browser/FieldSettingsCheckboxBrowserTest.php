<?php

use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Field settings checkboxes are shadcn Checkbox (Radix buttons): the
 * name/value ones must still post through the form, the controlled ones
 * through the hidden settings inputs.
 */
it('saves named and controlled setting checkboxes from the field drawer', function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['name' => 'Checkbox Posts', 'slug' => 'checkbox-posts']);
    $field = CollectionField::factory()->for($collection)->create([
        'name' => 'topics',
        'type' => FieldTypeEnum::Tag,
        'settings' => ['presets' => ['alpha']],
    ]);

    visit(route('collections.fields.index', $collection, false))
        ->click('topics')
        ->wait(0.5)
        ->assertAttribute('#tag_lowercase', 'role', 'checkbox')
        ->click('#tag_lowercase')
        ->click('#field_required')
        ->assertAttribute('#tag_lowercase', 'aria-checked', 'true')
        ->click('form button[type="submit"]')
        ->wait(1.5)
        ->assertNoJavaScriptErrors();

    $settings = $field->fresh()->settings;

    expect(CollectionField::settingsFlagIsEnabled($settings['lowercase'] ?? false))->toBeTrue()
        ->and(CollectionField::settingsFlagIsEnabled($settings['required'] ?? false))->toBeTrue();
});
