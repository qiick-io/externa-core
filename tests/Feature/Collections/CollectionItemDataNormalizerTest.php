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

it('normalizes legacy lat/lng map values to GeoJSON Point', function (): void {
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'location',
        'type' => FieldTypeEnum::Map,
        'translatable' => false,
        'settings' => ['geometry_mode' => 'point'],
    ]);

    $normalizer = app(CollectionItemDataNormalizer::class);

    expect($normalizer->normalize($collection, [
        'location' => ['lat' => 45.5, 'lng' => 9.25],
    ])['location'])->toBe([
        'type' => 'Point',
        'coordinates' => [9.25, 45.5],
    ]);
});

it('normalizes GeoJSON MultiPoint and coerces Point when mode is multipoint', function (): void {
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'stops',
        'type' => FieldTypeEnum::Map,
        'translatable' => false,
        'settings' => ['geometry_mode' => 'multipoint'],
    ]);

    $normalizer = app(CollectionItemDataNormalizer::class);

    expect($normalizer->normalize($collection, [
        'stops' => [
            'type' => 'MultiPoint',
            'coordinates' => [[9.25, 45.5], [12.5, 41.9]],
        ],
    ])['stops'])->toBe([
        'type' => 'MultiPoint',
        'coordinates' => [[9.25, 45.5], [12.5, 41.9]],
    ]);

    expect($normalizer->normalize($collection, [
        'stops' => ['lat' => 45.0, 'lng' => 9.0],
    ])['stops'])->toBe([
        'type' => 'MultiPoint',
        'coordinates' => [[9.0, 45.0]],
    ]);
});

it('rejects invalid map coordinates as null', function (): void {
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'location',
        'type' => FieldTypeEnum::Map,
        'translatable' => false,
    ]);

    $normalizer = app(CollectionItemDataNormalizer::class);

    expect($normalizer->normalize($collection, [
        'location' => ['lat' => 999, 'lng' => 9.19],
    ])['location'])->toBeNull();

    expect($normalizer->normalize($collection, [
        'location' => ['type' => 'LineString', 'coordinates' => []],
    ])['location'])->toBeNull();
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
