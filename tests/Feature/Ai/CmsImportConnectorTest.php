<?php

use App\Ai\Tools\ImportRemoteJson;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Tools\Request;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('directus profile strips system fields and promotes translation scalars', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $payload = json_decode(
        (string) file_get_contents(base_path('tests/Fixtures/cms/directus-items.json')),
        true,
        flags: JSON_THROW_ON_ERROR,
    );

    Http::fake([
        'https://example.com/items/pages*' => Http::response($payload, 200, [
            'Content-Type' => 'application/json',
        ]),
    ]);

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://example.com/items/pages',
        'collection_name' => 'directus-pages',
        'profile' => 'directus',
        'upsert_key' => 'slug',
    ]));

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('"profile": "directus"')
        ->and($result)->toContain('"created": 2');

    $collection = Collection::query()->where('name', 'directus-pages')->first();
    expect($collection)->not->toBeNull();

    $fieldNames = $collection->fields()->pluck('name')->all();
    expect($fieldNames)->toContain('title')
        ->and($fieldNames)->toContain('body')
        ->and($fieldNames)->not->toContain('user_created')
        ->and($fieldNames)->not->toContain('date_created');

    $home = CollectionItem::query()
        ->where('collection_id', $collection->id)
        ->with('fieldValues.field')
        ->get()
        ->first(function (CollectionItem $item): bool {
            $slug = $item->fieldValues->first(
                fn ($value) => $value->field->name === 'slug'
            )?->value;

            return $slug === 'home';
        });

    expect($home)->not->toBeNull();

    $values = $home->fieldValues->mapWithKeys(
        fn ($value) => [$value->field->name => $value->value]
    );

    expect($values['title'] ?? null)->toBe('Home')
        ->and($values['body'] ?? null)->toBe('Benvenuti')
        ->and($values->has('user_created'))->toBeFalse();
});

test('directus profile dry_run writes nothing', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $payload = json_decode(
        (string) file_get_contents(base_path('tests/Fixtures/cms/directus-items.json')),
        true,
        flags: JSON_THROW_ON_ERROR,
    );

    Http::fake([
        'https://example.com/items/pages*' => Http::response($payload, 200),
    ]);

    $before = CollectionItem::query()->count();

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://example.com/items/pages',
        'collection_name' => 'directus-dry',
        'profile' => 'directus',
        'dry_run' => true,
    ]));

    expect($result)->toContain('proposed_fields')
        ->and($result)->toContain('"profile": "directus"')
        ->and(Collection::query()->where('name', 'directus-dry')->exists())->toBeFalse()
        ->and(CollectionItem::query()->count())->toBe($before);
});

test('wordpress profile unwraps rendered envelopes', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $payload = json_decode(
        (string) file_get_contents(base_path('tests/Fixtures/cms/wordpress-posts.json')),
        true,
        flags: JSON_THROW_ON_ERROR,
    );

    Http::fake([
        'https://example.com/wp-json/wp/v2/posts*' => Http::response($payload, 200),
    ]);

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://example.com/wp-json/wp/v2/posts',
        'collection_name' => 'wp-posts',
        'profile' => 'wordpress',
    ]));

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('"profile": "wordpress"')
        ->and($result)->toContain('"created": 2');

    $collection = Collection::query()->where('name', 'wp-posts')->first();
    expect($collection)->not->toBeNull();

    $item = CollectionItem::query()
        ->where('collection_id', $collection->id)
        ->with('fieldValues.field')
        ->first();

    $values = $item->fieldValues->mapWithKeys(
        fn ($value) => [$value->field->name => $value->value]
    );

    expect($values['title'] ?? null)->toBe('Hello world')
        ->and($values['content'] ?? null)->toBe('<p>Hi</p>')
        ->and($values['title'] ?? null)->not->toContain('rendered');
});

test('unsupported cms import profile returns error', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    Http::fake();

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://example.com/items/x',
        'collection_name' => 'bad-profile',
        'profile' => 'sanity',
    ]));

    expect($result)->toContain('Unsupported CMS import profile')
        ->and(Collection::query()->where('name', 'bad-profile')->exists())->toBeFalse();

    Http::assertNothingSent();
});
