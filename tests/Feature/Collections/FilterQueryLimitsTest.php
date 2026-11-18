<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Collections\CollectionItemQueryService;
use App\Services\Validation\FilterQueryLimitsService;
use App\Services\Validation\StringLimitsService;
use Illuminate\Validation\ValidationException;

test('filter query rejects oversized string operand', function () {
    expect(fn () => FilterQueryLimitsService::assertValid([
        'title' => str_repeat('x', StringLimitsService::FILTER_VALUE + 1),
    ]))->toThrow(ValidationException::class);
});

test('filter query rejects too many keys', function () {
    $filters = [];
    for ($i = 0; $i < StringLimitsService::FILTER_MAX_KEYS + 1; $i++) {
        $filters['f'.$i] = 'ok';
    }

    expect(fn () => FilterQueryLimitsService::assertValid($filters))
        ->toThrow(ValidationException::class);
});

test('filter query rejects relational depth above the hard cap', function () {
    expect(fn () => FilterQueryLimitsService::assertValid([
        'author.profile.city' => ['_eq' => 'x'],
    ]))->toThrow(ValidationException::class);

    expect(FilterQueryLimitsService::assertValid([
        'author.name' => ['_eq' => 'Ada'],
    ]))->toBe([
        'author.name' => ['_eq' => 'Ada'],
    ]);

    expect(FilterQueryLimitsService::relationalKeyCount([
        'title' => 'x',
        'author.name' => ['_eq' => 'Ada'],
        'category.label' => ['_contains' => 'n'],
    ]))->toBe(2);
});

test('collection item query service applies filter caps', function () {
    $collection = Collection::query()->create([
        'name' => 'Filter Cap',
        'slug' => 'filter-cap-'.uniqid(),
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionItem::query()->create(['collection_id' => $collection->id]);

    $query = CollectionItem::query()->where('collection_id', $collection->id);

    expect(fn () => app(CollectionItemQueryService::class)->applyFilters(
        $query,
        $collection,
        ['title' => str_repeat('z', StringLimitsService::FILTER_VALUE + 1)],
    ))->toThrow(ValidationException::class);
});
