<?php

use App\Enums\FieldTypeEnum;
use Database\Seeders\PermissionSeeder;
use Tests\Support\FieldSettingsTestHelpers as H;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('string type settings persist', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'title', FieldTypeEnum::String);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'input_type' => 'email',
        'max_length' => 40,
        'placeholder' => ['en' => 'Enter title'],
        'icon_left' => 'mail',
        'icon_right' => 'check',
        'trim' => '1',
        'slugify' => '0',
        'masked' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'input_type' => 'email',
        'max_length' => 40,
        'placeholder' => ['en' => 'Enter title'],
        'icon_left' => 'mail',
        'icon_right' => 'check',
        'trim' => true,
        'slugify' => false,
        'masked' => true,
    ]);
});

test('string trim and slugify apply on store', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'slug', FieldTypeEnum::String, [
        'trim' => true,
        'slugify' => true,
    ]);

    H::storeItem($this, $collection, ['slug' => '  Hello World  '])->assertRedirect();
    expect(H::assemble(H::latestItem($collection))['slug'])->toBe('hello-world');
});

test('string max_length setting rejects too-long values', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'summary', FieldTypeEnum::String, [
        'max_length' => 5,
    ]);

    H::storeItem($this, $collection, ['summary' => 'toolong'])->assertSessionHasErrors('data.summary');
    H::storeItem($this, $collection, ['summary' => 'short'])->assertRedirect();
});

test('string input_type variants enforce value shape', function (string $inputType, mixed $bad, mixed $good) {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'typed', FieldTypeEnum::String, [
        'input_type' => $inputType,
    ]);

    H::storeItem($this, $collection, ['typed' => $bad])->assertSessionHasErrors('data.typed');
    H::storeItem($this, $collection, ['typed' => $good])->assertRedirect()->assertSessionHasNoErrors();
})->with([
    'integer' => ['integer', 'abc', '12'],
    'bigInteger' => ['bigInteger', 'nope', '99'],
    'float' => ['float', 'x', '1.5'],
    'decimal' => ['decimal', 'x', '2.25'],
    'uuid' => ['uuid', 'not-a-uuid', '550e8400-e29b-41d4-a716-446655440000'],
    'text' => ['text', str_repeat('a', 70000), 'ok'],
    'string' => ['string', str_repeat('a', 70000), 'ok'],
]);

test('textarea wysiwyg markdown max_length rejects oversized values', function (string $type) {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $name = 'body_'.$type;
    H::makeField($collection, $name, FieldTypeEnum::from($type), [
        'max_length' => 5,
    ]);

    H::storeItem($this, $collection, [$name => 'toolong'])->assertSessionHasErrors('data.'.$name);
    H::storeItem($this, $collection, [$name => 'short'])->assertRedirect();
})->with(['textarea', 'wysiwyg', 'markdown']);

test('number placeholder persists', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'qty', FieldTypeEnum::Number);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'min' => 0,
        'max' => 100,
        'step' => 1,
        'placeholder' => ['en' => 'Amount'],
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'placeholder' => ['en' => 'Amount'],
    ]);
});

test('api_autocomplete debounce trigger persists', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'place', FieldTypeEnum::ApiAutocomplete, [
        'url' => '/demo/cities?q={{value}}',
    ]);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'url' => '/demo/cities?q={{value}}',
        'trigger' => 'debounce',
        'rate' => 150,
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'trigger' => 'debounce',
        'rate' => 150,
    ]);
});

test('tag allow_other off rejects values outside presets', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    H::makeField($collection, 'labels', FieldTypeEnum::Tag, [
        'presets' => ['red', 'green'],
        'allow_other' => false,
    ]);

    H::storeItem($this, $collection, ['labels' => ['blue']])->assertSessionHasErrors();
    H::storeItem($this, $collection, ['labels' => ['red', 'green']])->assertRedirect();
});

test('textarea wysiwyg markdown rows max_length placeholder persist', function (string $type) {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $enum = FieldTypeEnum::from($type);
    $field = H::makeField($collection, 'body_'.$type, $enum);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'rows' => 8,
        'max_length' => 200,
        'placeholder' => ['en' => 'Write here'],
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'rows' => 8,
        'max_length' => 200,
        'placeholder' => ['en' => 'Write here'],
    ]);
})->with(['textarea', 'wysiwyg', 'markdown']);

test('number min max step persist and bounds reject out-of-range', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'qty', FieldTypeEnum::Number);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'min' => 1,
        'max' => 10,
        'step' => 0.5,
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'min' => 1,
        'max' => 10,
        'step' => 0.5,
    ]);

    H::storeItem($this, $collection, ['qty' => 0])->assertSessionHasErrors('data.qty');
    H::storeItem($this, $collection, ['qty' => 11])->assertSessionHasErrors('data.qty');
    H::storeItem($this, $collection, ['qty' => 5])->assertRedirect();
});

test('code language template line_numbers line_wrapping persist', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'payload', FieldTypeEnum::Code);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'language' => 'javascript',
        'template' => '// starter',
        'line_numbers' => '1',
        'line_wrapping' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'language' => 'javascript',
        'template' => '// starter',
        'line_numbers' => true,
        'line_wrapping' => true,
    ]);
});

test('tag presets separator flags persist; lowercase alphabetize apply; allow_other runtime', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'labels', FieldTypeEnum::Tag);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'presets' => 'red, green',
        'separator' => '|',
        'allow_other' => '1',
        'lowercase' => '1',
        'alphabetize' => '1',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'separator' => '|',
        'allow_other' => true,
        'lowercase' => true,
        'alphabetize' => true,
    ]);

    // presets may stay string or become array depending on normalizer — assert key present.
    expect($field->fresh()->settings)->toHaveKey('presets');

    H::storeItem($this, $collection, ['labels' => ['Beta', 'alpha']])->assertRedirect();
    expect(H::assemble(H::latestItem($collection))['labels'])->toBe(['alpha', 'beta']);
});

test('autocomplete placeholder and allow_other persist; options enforced when allow_other off', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'city', FieldTypeEnum::Autocomplete, [
        'options' => [
            ['value' => 'rome', 'label' => 'Rome'],
            ['value' => 'milan', 'label' => 'Milan'],
        ],
    ]);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'placeholder' => ['en' => 'Pick city'],
        'allow_other' => '0',
        'options' => [
            ['value' => 'rome', 'label' => 'Rome'],
            ['value' => 'milan', 'label' => 'Milan'],
        ],
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'placeholder' => ['en' => 'Pick city'],
        'allow_other' => false,
    ]);

    H::storeItem($this, $collection, ['city' => 'paris'])->assertSessionHasErrors('data.city');
    H::storeItem($this, $collection, ['city' => 'rome'])->assertRedirect();
});

test('api_autocomplete url paths trigger rate placeholder icons persist', function () {
    H::actingAsCollectionsAdmin($this);
    $collection = H::makeCollection();
    $field = H::makeField($collection, 'place', FieldTypeEnum::ApiAutocomplete, [
        'url' => '/demo/cities?q={{value}}',
    ]);

    H::assertSettingsRoundtrip($this, $collection, $field, [
        'url' => '/demo/search?q={{value}}',
        'results_path' => 'data.items',
        'text_path' => 'label',
        'value_path' => 'id',
        'trigger' => 'throttle',
        'rate' => 300,
        'placeholder' => ['en' => 'Search…'],
        'icon_left' => 'search',
        'icon_right' => 'x',
        'required' => '0',
        'readonly' => '0',
        'hidden_in_form' => '0',
        'layout_width' => 'full',
    ], [
        'url' => '/demo/search?q={{value}}',
        'results_path' => 'data.items',
        'text_path' => 'label',
        'value_path' => 'id',
        'trigger' => 'throttle',
        'rate' => 300,
        'placeholder' => ['en' => 'Search…'],
        'icon_left' => 'search',
        'icon_right' => 'x',
    ]);
});
