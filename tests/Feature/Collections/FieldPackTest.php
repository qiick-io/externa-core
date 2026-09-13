<?php

use App\Ai\Tools\ManageCollections;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use App\Support\Collections\FieldPacks\FieldPackRegistry;
use App\Support\Collections\FieldPacks\SeoInlineFieldPack;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    $this->withoutVite();
});

test('seo_inline field pack registry exposes ten opinionated fields', function () {
    $pack = FieldPackRegistry::find(SeoInlineFieldPack::KEY);

    expect($pack)->not->toBeNull()
        ->and($pack['key'])->toBe('seo_inline')
        ->and($pack['fields'])->toHaveCount(10)
        ->and(collect($pack['fields'])->pluck('name')->all())->toBe([
            'seo_title',
            'seo_description',
            'seo_keywords',
            'seo_alternate',
            'seo_canonical',
            'seo_robots',
            'seo_noindex',
            'seo_og_image',
            'seo_facebook_image',
            'seo_twitter_image',
        ]);
});

test('field pack registry includes publishing contact and social', function () {
    expect(FieldPackRegistry::keys())->toBe([
        'seo_inline',
        'publishing',
        'contact',
        'social',
    ]);
});

test('applying seo_inline field pack creates all fields on an empty collection', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.field-packs.apply', [$collection, 'seo_inline']))
        ->assertRedirect(route('collections.fields.index', $collection));

    $names = $collection->fields()->ordered()->pluck('name')->all();

    expect($names)->toBe([
        'seo_title',
        'seo_description',
        'seo_keywords',
        'seo_alternate',
        'seo_canonical',
        'seo_robots',
        'seo_noindex',
        'seo_og_image',
        'seo_facebook_image',
        'seo_twitter_image',
    ]);

    $title = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'seo_title')
        ->first();

    expect($title)->not->toBeNull()
        ->and($title->type)->toBe(FieldTypeEnum::String)
        ->and($title->translatable)->toBeTrue();

    $robots = CollectionField::query()
        ->where('collection_id', $collection->id)
        ->where('name', 'seo_robots')
        ->first();

    expect($robots->type)->toBe(FieldTypeEnum::Select)
        ->and($robots->translatable)->toBeFalse();
});

test('applying publishing field pack creates status published_at featured', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.field-packs.apply', [$collection, 'publishing']))
        ->assertRedirect(route('collections.fields.index', $collection));

    expect($collection->fields()->ordered()->pluck('name')->all())->toBe([
        'status',
        'published_at',
        'featured',
    ]);

    $status = $collection->fields()->where('name', 'status')->first();
    expect($status->type)->toBe(FieldTypeEnum::Select);
});

test('applying contact field pack creates address fields', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.field-packs.apply', [$collection, 'contact']))
        ->assertRedirect(route('collections.fields.index', $collection));

    expect($collection->fields()->count())->toBe(6)
        ->and($collection->fields()->where('name', 'email')->exists())->toBeTrue()
        ->and($collection->fields()->where('name', 'postal_code')->exists())->toBeTrue();
});

test('applying seo_inline field pack skips duplicate field names', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'seo_title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    $this->post(route('collections.field-packs.apply', [$collection, 'seo_inline']))
        ->assertRedirect(route('collections.fields.index', $collection));

    expect($collection->fields()->count())->toBe(10)
        ->and($collection->fields()->where('name', 'seo_title')->count())->toBe(1)
        ->and($collection->fields()->where('name', 'seo_title')->first()->translatable)->toBeFalse();
});

test('applying field pack requires can-edit-collections', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.field-packs.apply', [$collection, 'seo_inline']))
        ->assertForbidden();

    expect($collection->fields()->count())->toBe(0);
});

test('applying unknown field pack fails validation', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->post(route('collections.field-packs.apply', [$collection, 'not-a-pack']))
        ->assertSessionHasErrors('pack');

    expect($collection->fields()->count())->toBe(0);
});

test('manage collections list_field_packs returns seo_inline pack summary', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'list_field_packs',
    ]));

    expect($result)->toContain('"key": "seo_inline"')
        ->and($result)->toContain('seo_title')
        ->and($result)->toContain('publishing')
        ->and($result)->toContain('contact')
        ->and($result)->toContain('social');
});

test('manage collections apply_field_pack creates seo_inline fields', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanEditCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'apply_field_pack',
        'collection_id' => $collection->id,
        'pack' => 'seo_inline',
    ]));

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('"pack": "seo_inline"')
        ->and($collection->fields()->count())->toBe(10);

    $again = (string) (new ManageCollections)->handle(new Request([
        'action' => 'apply_field_pack',
        'collection_id' => $collection->id,
        'pack' => 'seo_inline',
    ]));

    expect($again)->toContain('"ok": true')
        ->and($again)->toContain('seo_title')
        ->and($collection->fields()->count())->toBe(10);
});

test('manage collections apply_field_pack requires edit permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $result = (string) (new ManageCollections)->handle(new Request([
        'action' => 'apply_field_pack',
        'collection_id' => $collection->id,
        'pack' => 'seo_inline',
    ]));

    expect($result)->toContain('Missing permission')
        ->and($collection->fields()->count())->toBe(0);
});

test('fields index includes fieldPacks inertia prop', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();

    $this->get(route('collections.fields.index', $collection))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('collections/collections/fields')
            ->has('fieldPacks', 4)
            ->where('fieldPacks.0.key', 'seo_inline')
            ->has('fieldPacks.0.fields', 10));
});
