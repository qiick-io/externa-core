<?php

use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\LivePreviewToken;
use App\Services\Collections\LivePreviewUrlBuilder;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

function grantLivePreviewPermissions(User $user): User
{
    $user->givePermissionTo(PermissionEnum::CanShowCollections->value);
    $user->givePermissionTo(PermissionEnum::CanEditCollections->value);

    return $user;
}

test('live preview token round-trips and rejects tampering', function () {
    $tokens = app(LivePreviewToken::class);
    $minted = $tokens->mint(3, 9, 'draft', 'en', now()->addMinutes(10)->getTimestamp());

    $claims = $tokens->verify($minted);
    expect($claims)->toMatchArray([
        'collection_id' => 3,
        'item_id' => 9,
        'version' => 'draft',
        'locale' => 'en',
    ]);

    $tampered = substr($minted, 0, -4).'xxxx';
    expect($tokens->verify($tampered))->toBeNull();
});

test('live preview token rejects expired claims', function () {
    $tokens = app(LivePreviewToken::class);
    $minted = $tokens->mint(1, 2, 'published', null, now()->subMinute()->getTimestamp());

    expect($tokens->verify($minted))->toBeNull();
});

test('url builder expands tokens and falls back to project default', function () {
    $collection = Collection::factory()->create([
        'slug' => 'posts',
        'preview_url' => null,
        'versioning' => true,
    ]);
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'preview_url_default',
        'https://site.test/p/{{collection}}/{{id}}?v={{version}}&token={{token}}&locale={{locale}}',
    );

    $built = app(LivePreviewUrlBuilder::class)->build($collection, $item, 'draft', 'it');

    expect($built['url'])
        ->toStartWith('https://site.test/p/posts/'.$item->id.'?')
        ->and($built['url'])->toContain('v=draft')
        ->and($built['url'])->toContain('locale=it')
        ->and($built['url'])->toContain('token=')
        ->and($built['expires_at'])->toMatch('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/');
});

test('collection preview_url overrides project default', function () {
    $collection = Collection::factory()->create([
        'slug' => 'pages',
        'preview_url' => 'https://override.test/{{slug}}/{{id}}?token={{token}}',
    ]);
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    app(SettingsRepository::class)->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'preview_url_default',
        'https://default.test/{{id}}',
    );

    $built = app(LivePreviewUrlBuilder::class)->build($collection, $item, 'published');

    expect($built['url'])->toStartWith('https://override.test/pages/'.$item->id.'?token=');
});

test('live preview url endpoint requires auth and configured template', function () {
    $collection = Collection::factory()->create(['preview_url' => null]);
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $user = grantLivePreviewPermissions(User::factory()->create());

    $this->actingAs($user)
        ->getJson(route('collections.items.live-preview-url', [$collection, $item]))
        ->assertStatus(422);

    $collection->update([
        'preview_url' => 'https://front.test/preview/{{id}}?token={{token}}&version={{version}}',
    ]);

    $this->actingAs($user)
        ->getJson(route('collections.items.live-preview-url', [$collection, $item]).'?version=published')
        ->assertOk()
        ->assertJsonStructure(['url', 'expires_at']);
});

test('live preview url endpoint is forbidden for guests', function () {
    $collection = Collection::factory()->create([
        'preview_url' => 'https://front.test/{{id}}?token={{token}}',
    ]);
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);

    $this->getJson(route('collections.items.live-preview-url', [$collection, $item]))
        ->assertUnauthorized();
});

test('public api preview returns draft data with valid token', function () {
    $collection = Collection::factory()->create(['versioning' => true, 'slug' => 'posts']);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'draft_data' => ['title' => 'Draft title'],
    ]);

    $token = app(LivePreviewToken::class)->mint(
        $collection->id,
        $item->id,
        'draft',
        null,
        now()->addMinutes(5)->getTimestamp(),
    );

    $this->getJson('/api/v1/preview?token='.urlencode($token))
        ->assertOk()
        ->assertJsonPath('meta.preview', true)
        ->assertJsonPath('meta.version', 'draft')
        ->assertJsonPath('data.data.title', 'Draft title');
});

test('public api preview rejects invalid token', function () {
    $this->getJson('/api/v1/preview?token=not-a-token')
        ->assertForbidden();
});

test('collection update persists preview_url', function () {
    $user = grantLivePreviewPermissions(User::factory()->create());
    $collection = Collection::factory()->create(['preview_url' => null]);

    $this->actingAs($user)
        ->put(route('collections.update', $collection), [
            'name' => $collection->name,
            'slug' => $collection->slug,
            'preview_url' => 'https://front.test/{{collection}}/{{id}}?token={{token}}',
        ])
        ->assertRedirect();

    expect($collection->fresh()->preview_url)
        ->toBe('https://front.test/{{collection}}/{{id}}?token={{token}}');
});
