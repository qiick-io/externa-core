<?php

use App\Enums\FieldTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;

/**
 * Short controls (number, date, color, slug) fill their field: only the
 * field's layout_width decides how wide they are.
 */
it('makes short controls fill their field column', function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);

    $user = User::factory()->create();
    $user->assignRole(RoleEnum::SuperAdmin->value);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['name' => 'Journal', 'slug' => 'journal', 'versioning' => false]);

    foreach ([
        ['amount', FieldTypeEnum::Number, null],
        ['day', FieldTypeEnum::Date, null],
        ['tone', FieldTypeEnum::Color, null],
        ['handle', FieldTypeEnum::String, ['slugify' => true]],
    ] as $sort => [$name, $type, $settings]) {
        CollectionField::factory()->for($collection)->create([
            'name' => $name,
            'type' => $type,
            'settings' => $settings,
            'sort_order' => $sort,
        ]);
    }

    $ratios = visit(route('collections.items.new', $collection, false))->script(<<<'JS'
        [
            document.getElementById('data_amount'),
            document.getElementById('data_day'),
            document.querySelector('[name="data[tone]"]')?.parentElement,
            document.getElementById('data_handle'),
        ].map((control) => {
            const field = control?.closest('[data-slot=field]');

            return field ? Math.round((control.getBoundingClientRect().width / field.getBoundingClientRect().width) * 100) : 0;
        })
    JS);

    foreach ($ratios as $ratio) {
        expect($ratio)->toBeGreaterThanOrEqual(95);
    }
});
