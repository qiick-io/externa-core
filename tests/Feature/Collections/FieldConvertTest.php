<?php

declare(strict_types=1);

use App\Ai\Tools\ManageCollections;
use App\Data\Collections\FieldConvertOptionsData;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionItemRevision;
use App\Models\CollectionItemValue;
use App\Models\User;
use App\Services\Collections\CollectionFieldConvertService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Artisan;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @return array{collection: Collection, field: CollectionField, item: CollectionItem, user: User}
 */
function convertFixture(
    FieldTypeEnum $type = FieldTypeEnum::String,
    bool $translatable = false,
    mixed $published = 'Hello',
    ?array $draft = null,
): array {
    $user = grantCollectionPermissions(User::factory()->create());
    test()->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    $field = CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => $type,
        'translatable' => $translatable,
        'settings' => $type === FieldTypeEnum::Select
            ? ['options' => [['value' => 'a', 'label' => 'A']]]
            : null,
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'draft_data' => $draft,
    ]);

    if ($published !== null) {
        if ($translatable && is_array($published)) {
            foreach ($published as $locale => $value) {
                CollectionItemValue::query()->create([
                    'item_id' => $item->id,
                    'field_id' => $field->id,
                    'locale' => $locale,
                    'position' => 0,
                    'value' => $value,
                ]);
            }
        } else {
            CollectionItemValue::query()->create([
                'item_id' => $item->id,
                'field_id' => $field->id,
                'locale' => null,
                'position' => 0,
                'value' => $published,
            ]);
        }
    }

    return compact('collection', 'field', 'item', 'user');
}

it('registers externa:field-convert', function () {
    expect(Artisan::all())->toHaveKey('externa:field-convert');
});

test('dry-run previews string→textarea without writing', function () {
    ['field' => $field, 'item' => $item] = convertFixture();

    $result = app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
        toType: FieldTypeEnum::Textarea,
        toTranslatable: false,
        dryRun: true,
    ));

    expect($result->supported)->toBeTrue()
        ->and($result->applied)->toBeFalse()
        ->and($result->dryRun)->toBeTrue()
        ->and($result->counts['ok'])->toBe(1)
        ->and($result->counts['failed'])->toBe(0)
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::String);

    expect(CollectionItemValue::query()->where('item_id', $item->id)->value('value'))
        ->toBe('Hello');
});

test('converts published and draft values string→markdown', function () {
    ['collection' => $collection, 'field' => $field, 'item' => $item] = convertFixture(
        draft: ['body' => 'Draft hello'],
    );

    $result = app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
        toType: FieldTypeEnum::Markdown,
        toTranslatable: false,
        dryRun: false,
    ));

    expect($result->applied)->toBeTrue()
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::Markdown);

    $assembled = app(CollectionItemValuesAssemblerService::class)->assemble($item->fresh());
    expect($assembled['body'] ?? null)->toBe('Hello')
        ->and($item->fresh()->draft_data['body'] ?? null)->toBe('Draft hello');

    expect(CollectionItemRevision::query()->where('item_id', $item->id)->where('meta->source', 'convert')->exists())
        ->toBeTrue();
});

test('converts non-translatable → translatable into default locale', function () {
    ['field' => $field, 'item' => $item] = convertFixture();

    $result = app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
        toType: FieldTypeEnum::String,
        toTranslatable: true,
        dryRun: false,
    ));

    expect($result->applied)->toBeTrue()
        ->and($field->fresh()->translatable)->toBeTrue();

    $assembled = app(CollectionItemValuesAssemblerService::class)->assemble($item->fresh());
    expect($assembled['body'])->toBeArray()
        ->and($assembled['body'])->toHaveKey('en')
        ->and($assembled['body']['en'])->toBe('Hello');
});

test('converts translatable → non-translatable picking locale', function () {
    ['field' => $field, 'item' => $item] = convertFixture(
        translatable: true,
        published: ['en' => 'EN', 'it' => 'IT'],
    );

    $result = app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
        toType: FieldTypeEnum::String,
        toTranslatable: false,
        locale: 'it',
        dryRun: false,
    ));

    expect($result->applied)->toBeTrue()
        ->and($field->fresh()->translatable)->toBeFalse();

    $assembled = app(CollectionItemValuesAssemblerService::class)->assemble($item->fresh());
    expect($assembled['body'] ?? null)->toBe('IT');
});

test('string→select creates missing options and converts values', function () {
    ['field' => $field, 'item' => $item] = convertFixture(published: 'featured');

    $result = app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
        toType: FieldTypeEnum::Select,
        toTranslatable: false,
        createMissingOptions: true,
        dryRun: false,
    ));

    expect($result->applied)->toBeTrue()
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::Select);

    $options = $field->fresh()->settings['options'] ?? [];
    expect(collect($options)->pluck('value')->all())->toContain('featured');

    $assembled = app(CollectionItemValuesAssemblerService::class)->assemble($item->fresh());
    expect($assembled['body'] ?? null)->toBe('featured');
});

test('unconvertible string→select without create options reports failure and writes nothing', function () {
    ['field' => $field] = convertFixture(published: 'orphan');
    $field->update([
        'settings' => ['options' => [['value' => 'known', 'label' => 'Known']]],
    ]);

    $result = app(CollectionFieldConvertService::class)->run($field->fresh(), new FieldConvertOptionsData(
        toType: FieldTypeEnum::Select,
        toTranslatable: false,
        createMissingOptions: false,
        dryRun: false,
    ));

    expect($result->applied)->toBeFalse()
        ->and($result->counts['failed'])->toBe(1)
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::String)
        ->and(CollectionItemValue::query()->where('field_id', $field->id)->value('value'))->toBe('orphan');
});

test('unsupported pair is rejected', function () {
    ['field' => $field] = convertFixture();

    $result = app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
        toType: FieldTypeEnum::Number,
        toTranslatable: false,
        dryRun: false,
    ));

    expect($result->supported)->toBeFalse()
        ->and($result->applied)->toBeFalse()
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::String);
});

test('revisions are not modified by a conversion', function () {
    ['field' => $field, 'item' => $item, 'user' => $user] = convertFixture();

    $revision = CollectionItemRevision::query()->create([
        'item_id' => $item->id,
        'user_id' => $user->id,
        'data' => ['body' => 'Snapshot'],
        'meta' => ['source' => 'sync'],
        'created_at' => now(),
    ]);

    app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
        toType: FieldTypeEnum::Textarea,
        toTranslatable: false,
        dryRun: false,
    ));

    expect($revision->fresh()->data)->toBe(['body' => 'Snapshot']);
});

test('restoring a pre-conversion revision adapts text values to the new type', function () {
    ['collection' => $collection, 'field' => $field, 'item' => $item, 'user' => $user] = convertFixture();

    $revision = CollectionItemRevision::query()->create([
        'item_id' => $item->id,
        'user_id' => $user->id,
        'data' => ['body' => 'From revision'],
        'meta' => ['source' => 'sync'],
        'created_at' => now()->subMinute(),
    ]);

    app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
        toType: FieldTypeEnum::Markdown,
        toTranslatable: false,
        dryRun: false,
    ));

    $this->actingAs($user)
        ->post(route('collections.items.revisions.restore', [$collection, $item, $revision]))
        ->assertRedirect();

    $assembled = app(CollectionItemValuesAssemblerService::class)->assemble($item->fresh());
    expect($field->fresh()->type)->toBe(FieldTypeEnum::Markdown)
        ->and($assembled['body'] ?? null)->toBe('From revision');
});

test('artisan dry-run matches service and is idempotent on re-run', function () {
    ['field' => $field] = convertFixture();

    expect(Artisan::call('externa:field-convert', [
        'field' => $field->id,
        '--to' => 'textarea',
        '--dry-run' => true,
    ]))->toBe(0);

    expect(Artisan::output())->toContain('[dry-run]')
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::String);

    expect(Artisan::call('externa:field-convert', [
        'field' => $field->id,
        '--to' => 'textarea',
    ]))->toBe(0);

    expect($field->fresh()->type)->toBe(FieldTypeEnum::Textarea);

    expect(Artisan::call('externa:field-convert', [
        'field' => $field->id,
        '--to' => 'textarea',
    ]))->toBe(0);

    expect($field->fresh()->type)->toBe(FieldTypeEnum::Textarea);
});

test('HTTP dry-run endpoint returns preview JSON', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    ['collection' => $collection, 'field' => $field] = convertFixture();

    $this->actingAs($user)
        ->postJson(route('collections.fields.convert', [$collection, $field]), [
            'type' => 'textarea',
            'dry_run' => true,
            'sync' => true,
        ])
        ->assertOk()
        ->assertJsonPath('dry_run', true)
        ->assertJsonPath('applied', false)
        ->assertJsonPath('counts.ok', 1);

    expect($field->fresh()->type)->toBe(FieldTypeEnum::String);
});

test('AI convert_field dry-run and apply', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);
    ['collection' => $collection, 'field' => $field] = convertFixture();

    $tool = app(ManageCollections::class);
    $preview = (string) $tool->handle(new Request([
        'action' => 'convert_field',
        'collection_id' => $collection->id,
        'field_id' => $field->id,
        'type' => 'textarea',
        'dry_run' => true,
    ]));

    $previewPayload = json_decode($preview, true);
    expect($previewPayload['ok'] ?? false)->toBeTrue()
        ->and($previewPayload['convert']['dry_run'] ?? false)->toBeTrue()
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::String);

    $applied = (string) $tool->handle(new Request([
        'action' => 'convert_field',
        'collection_id' => $collection->id,
        'field_id' => $field->id,
        'type' => 'textarea',
        'dry_run' => false,
    ]));

    $appliedPayload = json_decode($applied, true);
    expect($appliedPayload['ok'] ?? false)->toBeTrue()
        ->and($field->fresh()->type)->toBe(FieldTypeEnum::Textarea);
});

test('converts every item across several write chunks (#441)', function () {
    ['collection' => $collection, 'field' => $field] = convertFixture(draft: ['body' => 'Draft 0']);

    foreach (range(1, 4) as $index) {
        $item = CollectionItem::factory()->create([
            'collection_id' => $collection->id,
            'draft_data' => ['body' => "Draft {$index}"],
        ]);
        CollectionItemValue::query()->create([
            'item_id' => $item->id,
            'field_id' => $field->id,
            'locale' => null,
            'position' => 0,
            'value' => "Hello {$index}",
        ]);
    }

    $result = app(CollectionFieldConvertService::class)->run($field, new FieldConvertOptionsData(
        toType: FieldTypeEnum::Markdown,
        toTranslatable: false,
        chunkSize: 2,
        dryRun: false,
    ));

    expect($result->applied)->toBeTrue();

    foreach (CollectionItem::query()->where('collection_id', $collection->id)->get() as $item) {
        expect(CollectionItemRevision::query()
            ->where('item_id', $item->id)
            ->where('meta->source', 'convert')
            ->count())->toBe(2, "item {$item->id}: published and draft revisions");
    }
});
