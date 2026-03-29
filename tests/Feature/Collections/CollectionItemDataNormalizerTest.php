<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionItemDataNormalizer;

beforeEach(function (): void {
    config(['collections.locales' => ['en', 'it']]);
});

it('normalizes boolean scalars from html-like strings and integers', function (): void {
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'active',
        'type' => FieldTypeEnum::Boolean,
        'translatable' => false,
    ]);

    $normalizer = app(CollectionItemDataNormalizer::class);

    expect($normalizer->normalize($collection, ['active' => '1'])['active'])->toBeTrue();
    expect($normalizer->normalize($collection, ['active' => '0'])['active'])->toBeFalse();
    expect($normalizer->normalize($collection, ['active' => 1])['active'])->toBeTrue();
    expect($normalizer->normalize($collection, ['active' => 0])['active'])->toBeFalse();
    expect($normalizer->normalize($collection, ['active' => true])['active'])->toBeTrue();
    expect($normalizer->normalize($collection, ['active' => false])['active'])->toBeFalse();
});

it('normalizes translatable booleans from strings per locale', function (): void {
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'visible',
        'type' => FieldTypeEnum::Boolean,
        'translatable' => true,
    ]);

    $normalizer = app(CollectionItemDataNormalizer::class);

    $out = $normalizer->normalize($collection, [
        'visible' => [
            'en' => '1',
            'it' => '0',
        ],
    ]);

    expect($out['visible']['en'])->toBeTrue();
    expect($out['visible']['it'])->toBeFalse();
});
