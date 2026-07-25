<?php

use App\Ai\Tools\ManageCollections;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\User;
use App\Support\Collections\CollectionPacks\CollectionPackRegistry;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    $this->withoutVite();
});

test('collection pack registry lists seo categories pages articles products', function () {
    expect(CollectionPackRegistry::keys())->toBe([
        'seo',
        'categories',
        'pages',
        'articles',
        'products',
    ]);

    $seo = CollectionPackRegistry::find('seo');
    expect($seo)->not->toBeNull()
        ->and(collect($seo['fields'])->pluck('name')->all())->toBe([
            'title',
            'description',
            'keywords',
            'alternate',
            'canonical',
            'robots',
            'noindex',
            'og_image',
            'facebook_image',
            'twitter_image',
        ]);
});

test('applying seo collection pack is idempotent', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $this->post(route('collections.packs.apply', 'seo'))
        ->assertRedirect();

    $seo = Collection::query()->where('slug', 'seo')->first();
    expect($seo)->not->toBeNull()
        ->and($seo->fields()->count())->toBe(10);

    $title = $seo->fields()->where('name', 'title')->first();
    expect($title)->not->toBeNull()
        ->and($title->translatable)->toBeTrue()
        ->and($seo->fields()->where('name', 'seo_title')->exists())->toBeFalse();

    $this->post(route('collections.packs.apply', 'seo'))
        ->assertRedirect(route('collections.fields.index', $seo));

    expect(Collection::query()->where('slug', 'seo')->count())->toBe(1)
        ->and($seo->fresh()->fields()->count())->toBe(10);
});

test('applying articles pack creates seo categories articles and relations', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $this->post(route('collections.packs.apply', 'articles'))
        ->assertRedirect();

    $seo = Collection::query()->where('slug', 'seo')->firstOrFail();
    $categories = Collection::query()->where('slug', 'categories')->firstOrFail();
    $articles = Collection::query()->where('slug', 'articles')->firstOrFail();

    expect($seo->fields()->count())->toBe(10)
        ->and($categories->fields()->count())->toBe(3)
        ->and($articles->fields()->where('name', 'title')->exists())->toBeTrue()
        ->and($articles->fields()->where('name', 'body')->first()->type)->toBe(FieldTypeEnum::Blocks);

    $seoRel = $articles->fields()->where('name', 'seo')->first();
    $categoryRel = $articles->fields()->where('name', 'category')->first();

    expect($seoRel)->not->toBeNull()
        ->and($seoRel->type)->toBe(FieldTypeEnum::ManyToOne)
        ->and((int) data_get($seoRel->settings, 'related_collection_id'))->toBe($seo->id)
        ->and($categoryRel)->not->toBeNull()
        ->and($categoryRel->type)->toBe(FieldTypeEnum::ManyToOne)
        ->and((int) data_get($categoryRel->settings, 'related_collection_id'))->toBe($categories->id);
});

test('applying pages pack creates seo relation', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $this->post(route('collections.packs.apply', 'pages'))
        ->assertRedirect();

    $seo = Collection::query()->where('slug', 'seo')->firstOrFail();
    $pages = Collection::query()->where('slug', 'pages')->firstOrFail();

    $seoRel = $pages->fields()->where('name', 'seo')->first();
    expect($seoRel->type)->toBe(FieldTypeEnum::ManyToOne)
        ->and((int) data_get($seoRel->settings, 'related_collection_id'))->toBe($seo->id);
});

test('applying products pack creates deps and relations', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $this->post(route('collections.packs.apply', 'products'))
        ->assertRedirect();

    $products = Collection::query()->where('slug', 'products')->firstOrFail();
    expect($products->fields()->where('name', 'price')->first()->type)->toBe(FieldTypeEnum::Number)
        ->and($products->fields()->where('name', 'images')->first()->type)->toBe(FieldTypeEnum::Files)
        ->and($products->fields()->where('name', 'seo')->exists())->toBeTrue()
        ->and($products->fields()->where('name', 'category')->exists())->toBeTrue();
});

test('applying collection pack requires can-create-collections', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->post(route('collections.packs.apply', 'seo'))
        ->assertForbidden();

    expect(Collection::query()->where('slug', 'seo')->exists())->toBeFalse();
});

test('applying unknown collection pack fails validation', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $this->post(route('collections.packs.apply', 'not-a-pack'))
        ->assertSessionHasErrors('pack');
});

test('collections index includes collectionPacks inertia prop', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $this->get(route('collections.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('collections/collections/index')
            ->has('collectionPacks', 5)
            ->where('collectionPacks.0.key', 'seo'));
});

test('manage collections list_collection_packs returns summaries', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'list_collection_packs',
    ]));

    expect($result)->toContain('"key": "seo"')
        ->and($result)->toContain('"key": "articles"')
        ->and($result)->toContain('requires');
});

test('manage collections apply_collection_pack scaffolds articles', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'apply_collection_pack',
        'pack' => 'articles',
    ]));

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('"pack": "articles"')
        ->and(Collection::query()->where('slug', 'articles')->exists())->toBeTrue()
        ->and(Collection::query()->where('slug', 'seo')->exists())->toBeTrue()
        ->and(Collection::query()->where('slug', 'categories')->exists())->toBeTrue();
});

test('manage collections apply_collection_pack requires create permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'apply_collection_pack',
        'pack' => 'seo',
    ]));

    expect($result)->toContain('Missing permission')
        ->and(Collection::query()->where('slug', 'seo')->exists())->toBeFalse();
});
