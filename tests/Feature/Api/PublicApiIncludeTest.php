<?php

use App\Enums\CollectionPermissionAction;
use App\Enums\FieldTypeEnum;
use App\Enums\FilePermissionAction;
use App\Enums\FileTypeEnum;
use App\Enums\RoleEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\File;
use App\Models\FilePermission;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\FilePermissionGuard;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    Storage::fake('assets');
});

function includePublicRole(): Role
{
    return Role::query()->where('name', RoleEnum::Public->value)->firstOrFail();
}

/**
 * @param  list<FilePermissionAction|string>  $actions
 */
function grantIncludePublicFileActions(array $actions): void
{
    $role = includePublicRole();
    foreach ($actions as $action) {
        $value = $action instanceof FilePermissionAction ? $action->value : $action;
        FilePermission::query()->updateOrCreate(
            [
                'role_id' => $role->id,
                'action' => $value,
            ],
            ['allowed' => true],
        );
    }

    app(FilePermissionGuard::class)->forget($role->id);
}

function makeIncludeStoredFile(string $name = 'hero.jpg'): File
{
    Storage::disk('assets')->put('2026/07/'.$name, 'fake-bytes');

    return File::query()->create([
        'type' => FileTypeEnum::File,
        'name' => $name,
        'path' => '/'.$name,
        'disk' => 'assets',
        'storage_path' => '2026/07/'.$name,
        'mime_type' => 'image/jpeg',
        'size' => 10,
        'width' => 1600,
        'height' => 900,
        'hash' => hash('sha256', 'fake-bytes'),
    ]);
}

/**
 * @param  array<string, mixed>  $data
 */
function syncIncludeItem(CollectionItem $item, Collection $collection, array $data): void
{
    $normalized = app(CollectionItemDataNormalizer::class)->normalize($collection, $data, $item->wasRecentlyCreated);
    app(CollectionItemValuesWriter::class)->sync($item, $collection, $normalized);
}

it('keeps file fields as ids and users null without include', function (): void {
    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'include-slim',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $creator = User::factory()->create([
        'first_name' => 'Ada',
        'last_name' => 'Lovelace',
        'email' => 'ada@example.com',
    ]);
    $file = makeIncludeStoredFile('slim-cover.jpg');
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'user_created_id' => $creator->id,
        'user_updated_id' => $creator->id,
    ]);
    syncIncludeItem($item, $collection->fresh(['fields']), ['cover' => $file->id]);

    grantPublicActions($collection, [CollectionPermissionAction::Read]);
    grantIncludePublicFileActions([FilePermissionAction::Read]);

    $this->getJson("/api/v1/collections/include-slim/items/{$item->id}")
        ->assertOk()
        ->assertJsonPath('data.data.cover', $file->id)
        ->assertJsonPath('data.user_created_id', $creator->id)
        ->assertJsonPath('data.user_updated_id', $creator->id)
        ->assertJsonPath('data.user_created', null)
        ->assertJsonPath('data.user_updated', null)
        ->assertJsonMissingPath('data.data.cover.url');
});

it('expands files and users when included', function (): void {
    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'include-files',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $creator = User::factory()->create([
        'first_name' => 'Grace',
        'last_name' => 'Hopper',
        'email' => 'grace@example.com',
    ]);
    $file = makeIncludeStoredFile('expanded-cover.jpg');
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'user_created_id' => $creator->id,
    ]);
    syncIncludeItem($item, $collection->fresh(['fields']), ['cover' => $file->id]);

    grantPublicActions($collection, [CollectionPermissionAction::Read]);
    grantIncludePublicFileActions([FilePermissionAction::Read]);

    $this->getJson("/api/v1/collections/include-files/items/{$item->id}?include=files,users")
        ->assertOk()
        ->assertJsonPath('data.data.cover.id', $file->id)
        ->assertJsonPath('data.data.cover.filename', 'expanded-cover.jpg')
        ->assertJsonPath('data.data.cover.url', url("/api/v1/files/{$file->id}/content"))
        ->assertJsonPath('data.user_created.id', $creator->id)
        ->assertJsonPath('data.user_created.email', 'grace@example.com');
});

it('hydrates m2o and m2m relations only when field names are included', function (): void {
    $authors = Collection::query()->create([
        'name' => 'Authors',
        'slug' => 'include-authors',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);
    $author = $authors->items()->create([]);
    syncIncludeItem($author, $authors->fresh(['fields']), ['name' => 'Jane']);

    $tags = Collection::query()->create([
        'name' => 'Tags',
        'slug' => 'include-tags',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $tags->id,
        'name' => 'label',
        'type' => FieldTypeEnum::String,
    ]);
    $tag = $tags->items()->create([]);
    syncIncludeItem($tag, $tags->fresh(['fields']), ['label' => 'news']);

    $posts = Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'include-posts',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'categories',
        'type' => FieldTypeEnum::ManyToMany,
        'settings' => ['related_collection_id' => $tags->id],
    ]);

    $post = $posts->items()->create([]);
    syncIncludeItem($post, $posts->fresh(['fields']), [
        'author' => $author->id,
        'categories' => [
            ['related_item_id' => $tag->id, 'meta' => ['sort' => 2]],
        ],
    ]);

    grantPublicActions($posts, [CollectionPermissionAction::Read]);
    grantPublicActions($authors, [CollectionPermissionAction::Read]);
    grantPublicActions($tags, [CollectionPermissionAction::Read]);

    $slim = $this->getJson("/api/v1/collections/include-posts/items/{$post->id}")->assertOk();
    expect($slim->json('data.data.author'))->toBe($author->id)
        ->and($slim->json('data.data.categories.0.related_item_id'))->toBe($tag->id)
        ->and($slim->json('data.data.categories.0'))->not->toHaveKey('item');

    $m2o = $this->getJson("/api/v1/collections/include-posts/items/{$post->id}?include=author")->assertOk();
    expect($m2o->json('data.data.author.id'))->toBe($author->id)
        ->and($m2o->json('data.data.author.data.name'))->toBe('Jane')
        ->and($m2o->json('data.data.categories.0.related_item_id'))->toBe($tag->id)
        ->and($m2o->json('data.data.categories.0'))->not->toHaveKey('item');

    $m2m = $this->getJson("/api/v1/collections/include-posts/items/{$post->id}?include=categories")->assertOk();
    expect($m2m->json('data.data.author'))->toBe($author->id)
        ->and($m2m->json('data.data.categories.0.item.id'))->toBe($tag->id)
        ->and($m2m->json('data.data.categories.0.item.data.label'))->toBe('news')
        ->and($m2m->json('data.data.categories.0.meta.sort'))->toBe(2);
});

it('does not leak full payload for unreadable related items', function (): void {
    $authors = Collection::query()->create([
        'name' => 'Authors',
        'slug' => 'secret-authors',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $authors->id,
        'name' => 'name',
        'type' => FieldTypeEnum::String,
    ]);
    $author = $authors->items()->create([]);
    syncIncludeItem($author, $authors->fresh(['fields']), ['name' => 'Hidden Author']);

    $posts = Collection::query()->create([
        'name' => 'Posts',
        'slug' => 'leak-posts',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $posts->id,
        'name' => 'author',
        'type' => FieldTypeEnum::ManyToOne,
        'settings' => ['related_collection_id' => $authors->id],
    ]);
    $post = $posts->items()->create([]);
    syncIncludeItem($post, $posts->fresh(['fields']), ['author' => $author->id]);

    // Parent readable; related collection has no public read grant.
    grantPublicActions($posts, [CollectionPermissionAction::Read]);

    $response = $this->getJson("/api/v1/collections/leak-posts/items/{$post->id}?include=author")
        ->assertOk();

    expect($response->json('data.data.author'))->toBe($author->id)
        ->and(is_array($response->json('data.data.author')))->toBeFalse()
        ->and(json_encode($response->json()))->not->toContain('Hidden Author');
});

it('returns different cached payloads for different include values', function (): void {
    $collection = Collection::query()->create([
        'name' => 'Articles',
        'slug' => 'include-cache',
        'is_singleton' => false,
        'sort_order' => 1,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'cover',
        'type' => FieldTypeEnum::Image,
    ]);

    $file = makeIncludeStoredFile('cache-cover.jpg');
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    syncIncludeItem($item, $collection->fresh(['fields']), ['cover' => $file->id]);

    grantPublicActions($collection, [CollectionPermissionAction::Read]);
    grantIncludePublicFileActions([FilePermissionAction::Read]);

    $baseUrl = "/api/v1/collections/include-cache/items/{$item->id}";

    $slim = $this->getJson($baseUrl)->assertOk();
    expect($slim->json('data.data.cover'))->toBe($file->id);

    $expanded = $this->getJson($baseUrl.'?include=files')->assertOk();
    expect($expanded->json('data.data.cover.id'))->toBe($file->id)
        ->and($expanded->json('data.data.cover.filename'))->toBe('cache-cover.jpg');

    // Cache hit of slim must not return expanded shape (and vice versa).
    $slimAgain = $this->getJson($baseUrl)->assertOk();
    expect($slimAgain->json('data.data.cover'))->toBe($file->id)
        ->and($slimAgain->json('data.data.cover'))->not->toBeArray();

    $expandedAgain = $this->getJson($baseUrl.'?include=files')->assertOk();
    expect($expandedAgain->json('data.data.cover.filename'))->toBe('cache-cover.jpg');
});
