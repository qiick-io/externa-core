<?php

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\WysiwygHtmlSanitizer;

test('wysiwyg sanitizer strips scripts and keeps safe tags', function () {
    $sanitizer = app(WysiwygHtmlSanitizer::class);

    $clean = $sanitizer->sanitize(
        '<p>Hello <strong>world</strong></p><script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://example.com">ok</a>',
    );

    expect($clean)->toContain('<p>Hello <strong>world</strong></p>')
        ->and($clean)->not->toContain('<script')
        ->and($clean)->not->toContain('javascript:')
        ->and($clean)->toContain('https://example.com');
});

test('normalizer sanitizes wysiwyg field values', function () {
    $collection = Collection::query()->create([
        'name' => 'Pages',
        'slug' => 'pages-wysiwyg',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Wysiwyg,
    ]);

    $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, [
        'body' => '<p>Safe</p><img src=x onerror=alert(1)><script>bad()</script>',
    ], true);

    expect($normalized['body'])->toBe('<p>Safe</p>')
        ->and($normalized['body'])->not->toContain('script')
        ->and($normalized['body'])->not->toContain('img');
});
