<?php

use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\Setting;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Collections\CollectionListColumnsNormalizer;
use App\Services\Settings\SettingsRepository;
use Inertia\Testing\AssertableInertia;

test('list columns normalizer drops invalid paths and keeps nested relation and file meta', function () {
    $related = Collection::factory()->create(['slug' => 'authors']);
    CollectionField::factory()->create([
        'collection_id' => $related->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'sort_order' => 2,
        'settings' => ['related_collection_id' => $related->id],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
        'sort_order' => 3,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'body',
        'type' => FieldTypeEnum::Wysiwyg,
        'sort_order' => 4,
    ]);

    $normalizer = app(CollectionListColumnsNormalizer::class);

    $normalized = $normalizer->normalize([
        'id',
        'title',
        'author.title',
        'cover.filename_download',
        'author.missing',
        'cover.unknown',
        'nope',
        'body.nested',
        'id',
    ], $collection);

    expect($normalized)->toBe([
        'id',
        'title',
        'author.title',
        'cover.filename_download',
    ]);

    $defaults = $normalizer->defaults($collection);
    expect($defaults)->toContain('id')
        ->and($defaults)->toContain('title')
        ->and($defaults)->not->toContain('author')
        ->and($defaults)->not->toContain('cover')
        ->and($defaults)->not->toContain('body');

    $catalog = $normalizer->relatedFieldsCatalog($collection);
    expect($catalog)->toHaveKey('author')
        ->and($catalog['author'])->toContain([
            'name' => 'title',
            'display_name' => 'title',
            'type' => 'string',
        ])
        ->and($catalog)->toHaveKey('cover')
        ->and(collect($catalog['cover'])->pluck('name')->all())->toBe([
            'id',
            'filename_download',
            'type',
            'filesize',
        ]);
});

test('put list-columns persists user-scoped preferences', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'slug',
        'type' => FieldTypeEnum::String,
    ]);

    $this->from(route('collections.items.index', $collection))
        ->put(route('collections.items.list-columns.update', $collection), [
            'columns' => ['id', 'slug', 'title', 'bogus'],
            'aligns' => [
                'title' => 'center',
                'slug' => 'right',
                'bogus' => 'left',
                'id' => 'nope',
            ],
        ])
        ->assertRedirect();

    $stored = app(SettingsRepository::class)->get(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id,
        $user->id,
    );

    expect($stored)->toBe(['id', 'slug', 'title']);

    $aligns = app(SettingsRepository::class)->get(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id.'_aligns',
        $user->id,
    );
    expect($aligns)->toBe([
        'title' => 'center',
        'slug' => 'right',
    ]);

    $other = User::factory()->create();
    $otherStored = app(SettingsRepository::class)->get(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$collection->id,
        $other->id,
    );
    expect($otherStored)->toBeNull();

    expect(
        Setting::query()
            ->where('scope', SettingsRepository::SCOPE_USER)
            ->where('scope_id', $user->id)
            ->where('group', 'collection_list')
            ->where('key', 'collection_'.$collection->id)
            ->exists(),
    )->toBeTrue();
});

test('items index sorts by system and scalar fields', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create(['is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    $beta = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $writer->sync($beta, $collection, $normalizer->normalize($collection, [
        'title' => 'Beta',
    ]));

    $alpha = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $writer->sync($alpha, $collection, $normalizer->normalize($collection, [
        'title' => 'Alpha',
    ]));

    $this->get(route('collections.items.index', [
        'collection' => $collection,
        'sort' => 'title',
        'direction' => 'asc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/items/index')
            ->where('filters.sort', 'title')
            ->where('filters.direction', 'asc')
            ->where('items.data.0.id', $alpha->id)
            ->where('items.data.1.id', $beta->id));

    $this->get(route('collections.items.index', [
        'collection' => $collection,
        'sort' => 'id',
        'direction' => 'asc',
    ]))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('filters.sort', 'id')
            ->where('filters.direction', 'asc')
            ->where('items.data.0.id', $beta->id)
            ->where('items.data.1.id', $alpha->id));
});

test('items index includes list_columns and resolved relation displays', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $authors = Collection::factory()->create(['slug' => 'authors-list']);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $author = CollectionItem::factory()->create(['collection_id' => $authors->id]);
    app(CollectionItemValuesWriter::class)->sync(
        $author,
        $authors,
        app(CollectionItemDataNormalizer::class)->normalize($authors, [
            'title' => 'Ada Lovelace',
        ]),
    );

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'hero.jpg',
        'download_name' => 'hero-download.jpg',
        'path' => '/hero.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/hero.jpg',
        'mime_type' => 'image/jpeg',
        'size' => 2048,
    ]);

    $posts = Collection::factory()->create(['slug' => 'posts-list', 'is_singleton' => false]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'sort_order' => 2,
        'settings' => [
            'related_collection_id' => $authors->id,
            'display_field' => 'title',
        ],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
        'sort_order' => 3,
    ]);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_USER,
        'collection_list',
        'collection_'.$posts->id,
        ['id', 'title', 'author', 'author.title', 'cover.filename_download'],
        $user->id,
    );

    $post = CollectionItem::factory()->create(['collection_id' => $posts->id]);
    app(CollectionItemValuesWriter::class)->sync(
        $post,
        $posts,
        app(CollectionItemDataNormalizer::class)->normalize($posts, [
            'title' => 'Notes',
            'author' => $author->id,
            'cover' => $file->id,
        ]),
    );

    $this->get(route('collections.items.index', $posts))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('collections/items/index')
            ->where('list_columns', ['id', 'title', 'author', 'author.title', 'cover.filename_download'])
            ->has('column_aligns')
            ->has('related_fields_catalog.author')
            ->has('related_fields_catalog.cover')
            ->has('items.data', 1)
            ->where('items.data.0.data.title', 'Notes')
            ->where('items.data.0.displays', function ($displays): bool {
                $displays = collect($displays)->all();
                expect($displays['author'])->toBe('Ada Lovelace')
                    ->and($displays['author.title'])->toBe('Ada Lovelace')
                    ->and($displays['cover.filename_download'])->toBe('hero-download.jpg');

                return true;
            }));
});
