<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * Minimal fields.store coverage for thin types not already covered by dedicated
 * create assertions in CollectionsManagementTest (string/select/wysiwyg/…).
 */
test('thin field types can be created via fields.store', function (FieldTypeEnum $type, array $settings) {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $payload = [
        'name' => 'field_'.$type->value,
        'type' => $type->value,
    ];

    if ($settings !== []) {
        $payload['settings'] = $settings;
    }

    if ($type->isRelationType()) {
        $related = Collection::factory()->create();
        $payload['settings'] = array_merge($settings, [
            'related_collection_id' => $related->id,
            'display_field' => 'title',
        ]);
    }

    $this->post(route('collections.fields.store', $collection), $payload)
        ->assertSessionDoesntHaveErrors()
        ->assertRedirect(route('collections.fields.index', $collection));

    $field = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'field_'.$type->value)
        ->first();

    expect($field)->not->toBeNull()
        ->and($field->type)->toBe($type);

    if ($type->isRelationType()) {
        expect($field->settings['related_collection_id'] ?? null)->not->toBeNull();
    }
})->with([
    'textarea' => [FieldTypeEnum::Textarea, []],
    'markdown' => [FieldTypeEnum::Markdown, []],
    'code' => [FieldTypeEnum::Code, []],
    'tag' => [FieldTypeEnum::Tag, []],
    'number' => [FieldTypeEnum::Number, []],
    'boolean' => [FieldTypeEnum::Boolean, []],
    'date' => [FieldTypeEnum::Date, []],
    'color' => [FieldTypeEnum::Color, []],
    'multiselect' => [FieldTypeEnum::Multiselect, [
        'options' => [
            ['value' => 'a', 'label' => 'A'],
            ['value' => 'b', 'label' => 'B'],
        ],
    ]],
    'radio_group' => [FieldTypeEnum::RadioGroup, [
        'options' => [
            ['value' => 'x', 'label' => 'X'],
            ['value' => 'y', 'label' => 'Y'],
        ],
    ]],
    'one_to_many' => [FieldTypeEnum::OneToMany, []],
    'many_to_many' => [FieldTypeEnum::ManyToMany, []],
]);

test('field create matrix covers every FieldTypeEnum case at least once across suite seams', function () {
    $coveredHere = [
        FieldTypeEnum::Textarea,
        FieldTypeEnum::Markdown,
        FieldTypeEnum::Code,
        FieldTypeEnum::Tag,
        FieldTypeEnum::Number,
        FieldTypeEnum::Boolean,
        FieldTypeEnum::Date,
        FieldTypeEnum::Color,
        FieldTypeEnum::Multiselect,
        FieldTypeEnum::RadioGroup,
        FieldTypeEnum::OneToMany,
        FieldTypeEnum::ManyToMany,
    ];

    // Already exercised via CollectionsManagementTest / LayoutGroupsTest create paths.
    $coveredElsewhere = [
        FieldTypeEnum::String,
        FieldTypeEnum::Autocomplete,
        FieldTypeEnum::ApiAutocomplete,
        FieldTypeEnum::Wysiwyg,
        FieldTypeEnum::Select,
        FieldTypeEnum::CheckboxGroup,
        FieldTypeEnum::CheckboxGroupTree,
        FieldTypeEnum::Map,
        FieldTypeEnum::Image,
        FieldTypeEnum::Files,
        FieldTypeEnum::ManyToOne,
        FieldTypeEnum::M2a,
        FieldTypeEnum::Blocks,
        FieldTypeEnum::Hash,
        FieldTypeEnum::Slider,
        FieldTypeEnum::GroupAccordion,
        FieldTypeEnum::GroupDetail,
        FieldTypeEnum::GroupRaw,
        FieldTypeEnum::GroupTabs,
    ];

    $all = collect(FieldTypeEnum::cases())->map(fn (FieldTypeEnum $t) => $t->value)->sort()->values()->all();
    $union = collect([...$coveredHere, ...$coveredElsewhere])
        ->map(fn (FieldTypeEnum $t) => $t->value)
        ->unique()
        ->sort()
        ->values()
        ->all();

    expect($union)->toBe($all);
});
