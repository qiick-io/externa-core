<?php

use App\Enums\FieldTypeEnum;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\File;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Files\FileWhereUsedScanner;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    Cache::flush();
});

test('file where-used scanner finds image field references', function () {
    $collection = Collection::factory()->create(['name' => 'Articles']);
    CollectionField::factory()->for($collection)->create([
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'cover.jpg',
        'path' => '/cover.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/cover.jpg',
        'mime_type' => 'image/jpeg',
    ]);
    $other = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'other.jpg',
        'path' => '/other.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/other.jpg',
        'mime_type' => 'image/jpeg',
    ]);

    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, ['cover' => $file->id], true),
    );

    $refs = app(FileWhereUsedScanner::class)->findReferences((int) $file->id);

    expect($refs)->toHaveCount(1)
        ->and($refs[0]['collection_id'])->toBe($collection->id)
        ->and($refs[0]['item_id'])->toBe($item->id)
        ->and($refs[0]['field'])->toBe('cover');

    expect(app(FileWhereUsedScanner::class)->findReferences((int) $other->id))->toBe([]);
});

test('file where-used endpoint returns references for authorized users', function () {
    $user = grantFilePermissions(User::factory()->create(), [
        PermissionEnum::CanShowFiles->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->for($collection)->create([
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'hero.jpg',
        'path' => '/hero.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/hero.jpg',
        'mime_type' => 'image/jpeg',
    ]);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, ['cover' => $file->id], true),
    );

    $this->getJson(route('files.where-used', $file))
        ->assertOk()
        ->assertJsonPath('file_id', $file->id)
        ->assertJsonPath('count', 1)
        ->assertJsonPath('references.0.item_id', $item->id)
        ->assertJsonPath('references.0.field', 'cover');
});

test('file where-used ignores soft-deleted items', function () {
    $collection = Collection::factory()->create();
    CollectionField::factory()->for($collection)->create([
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $file = File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => 'gone.jpg',
        'path' => '/gone.jpg',
        'disk' => 'assets',
        'storage_path' => '2026/07/gone.jpg',
        'mime_type' => 'image/jpeg',
    ]);

    $item = $collection->items()->create([]);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizer::class)->normalize($collection, ['cover' => $file->id], true),
    );
    $item->delete();

    expect(app(FileWhereUsedScanner::class)->findReferences((int) $file->id))->toBe([]);
});
