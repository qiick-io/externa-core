<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use App\Services\Collections\LivePreviewAsOfResolverService;
use App\Services\Collections\LivePreviewTokenService;
use App\Services\Collections\LivePreviewUrlBuilderService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

function grantAsOfPreviewPermissions(User $user): User
{
    $user->givePermissionTo(PermissionEnum::CanShowCollections->value);
    $user->givePermissionTo(PermissionEnum::CanEditCollections->value);

    return $user;
}

function syncAsOfItemValues(CollectionItem $item, Collection $collection, array $data): void
{
    $normalized = app(CollectionItemDataNormalizerService::class)->normalize($collection, $data, true);
    app(CollectionItemValuesWriterService::class)->sync($item, $collection, $normalized);
}

test('live preview token round-trips optional as_of claim', function () {
    $asOf = now()->addDays(3)->getTimestamp();
    $tokens = app(LivePreviewTokenService::class);
    $minted = $tokens->mint(3, 9, 'published', 'en', now()->addMinutes(10)->getTimestamp(), 42, null, $asOf);

    $claims = $tokens->verify($minted);
    expect($claims)->toMatchArray([
        'collection_id' => 3,
        'item_id' => 9,
        'version' => 'published',
        'locale' => 'en',
        'user_id' => 42,
        'as_of' => $asOf,
    ]);
});

test('live preview token rejects as_of beyond 90 days ahead', function () {
    $tokens = app(LivePreviewTokenService::class);
    $tooFar = now()->addDays(LivePreviewAsOfResolverService::MAX_AHEAD_DAYS + 1)->getTimestamp();
    $minted = $tokens->mint(1, 2, 'published', null, now()->addMinutes(5)->getTimestamp(), 1, null, $tooFar);

    expect($tokens->verify($minted))->toBeNull();
});

test('as_of resolver overlays draft when publish_at is due', function () {
    $item = CollectionItem::factory()->create([
        'draft_data' => ['title' => 'Scheduled title'],
        'publish_at' => now()->addDay(),
        'published_at' => now()->subDay(),
    ]);

    $before = app(LivePreviewAsOfResolverService::class)->resolve($item, now()->addHours(12));
    expect($before)->toMatchArray(['visible' => true, 'use_draft' => false]);

    $after = app(LivePreviewAsOfResolverService::class)->resolve($item, now()->addDays(2));
    expect($after)->toMatchArray(['visible' => true, 'use_draft' => true]);
});

test('as_of resolver hides item when unpublish_at is due', function () {
    $item = CollectionItem::factory()->create([
        'published_at' => now()->subDay(),
        'unpublish_at' => now()->addDay(),
        'draft_data' => ['title' => 'Would publish'],
        'publish_at' => now()->addHours(12),
    ]);

    $resolver = app(LivePreviewAsOfResolverService::class);

    expect($resolver->resolve($item, now()->addHours(18)))
        ->toMatchArray(['visible' => true, 'use_draft' => true]);

    expect($resolver->resolve($item, now()->addDays(2)))
        ->toMatchArray(['visible' => false, 'use_draft' => false]);
});

test('as_of resolver hides never-published item before publish_at', function () {
    $item = CollectionItem::factory()->create([
        'draft_data' => ['title' => 'Not live yet'],
        'publish_at' => now()->addDays(2),
        'published_at' => null,
    ]);

    $resolver = app(LivePreviewAsOfResolverService::class);

    expect($resolver->resolve($item, now()->addDay()))
        ->toMatchArray(['visible' => false, 'use_draft' => false]);

    expect($resolver->resolve($item, now()->addDays(3)))
        ->toMatchArray(['visible' => true, 'use_draft' => true]);
});

test('live preview url endpoint validates as_of bound', function () {
    $collection = Collection::factory()->create([
        'preview_url' => 'https://front.test/{{id}}?token={{token}}',
        'versioning' => true,
    ]);
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $user = grantAsOfPreviewPermissions(User::factory()->create());

    $tooFar = now()->addDays(LivePreviewAsOfResolverService::MAX_AHEAD_DAYS + 5)->toIso8601String();

    $this->actingAs($user)
        ->getJson(route('collections.items.live-preview-url', [$collection, $item]).'?version=published&as_of='.urlencode($tooFar))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['as_of']);
});

test('live preview url endpoint mints token with as_of', function () {
    $collection = Collection::factory()->create([
        'preview_url' => 'https://front.test/{{id}}?token={{token}}',
        'versioning' => true,
    ]);
    $item = CollectionItem::factory()->create(['collection_id' => $collection->id]);
    $user = grantAsOfPreviewPermissions(User::factory()->create());
    $asOf = now()->addDays(5);

    $response = $this->actingAs($user)
        ->getJson(route('collections.items.live-preview-url', [$collection, $item]).'?version=published&as_of='.urlencode($asOf->toIso8601String()))
        ->assertOk()
        ->assertJsonStructure(['url', 'expires_at', 'as_of']);

    expect($response->json('as_of'))->toBe($asOf->utc()->format('Y-m-d\TH:i:s\Z'));

    $url = (string) $response->json('url');
    expect($url)->toContain('token=');
    parse_str(parse_url($url, PHP_URL_QUERY) ?: '', $query);
    $claims = app(LivePreviewTokenService::class)->verify((string) ($query['token'] ?? ''));
    expect($claims['as_of'])->toBe($asOf->getTimestamp());
});

test('public api preview overlays draft when as_of is after publish_at', function () {
    $collection = Collection::factory()->create(['versioning' => true, 'slug' => 'posts']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'published_at' => now()->subDay(),
        'draft_data' => ['title' => 'Future headline'],
        'publish_at' => now()->addDays(2),
    ]);
    syncAsOfItemValues($item, $collection, ['title' => 'Current headline']);
    $item->refresh();

    $user = grantAsOfPreviewPermissions(User::factory()->create());
    $asOf = now()->addDays(3);
    $token = app(LivePreviewTokenService::class)->mint(
        $collection->id,
        $item->id,
        'published',
        null,
        now()->addMinutes(5)->getTimestamp(),
        (int) $user->id,
        app(LivePreviewUrlBuilderService::class)->contentHash($item, 'published', $asOf),
        $asOf->getTimestamp(),
    );

    $this->getJson('/api/v1/preview?token='.urlencode($token))
        ->assertOk()
        ->assertJsonPath('meta.preview', true)
        ->assertJsonPath('meta.source', 'draft_overlay')
        ->assertJsonPath('meta.as_of', $asOf->utc()->format('Y-m-d\TH:i:s\Z'))
        ->assertJsonPath('data.data.title', 'Future headline');
});

test('public api preview keeps published values when as_of is before publish_at', function () {
    $collection = Collection::factory()->create(['versioning' => true, 'slug' => 'posts']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'published_at' => now()->subDay(),
        'draft_data' => ['title' => 'Future headline'],
        'publish_at' => now()->addDays(2),
    ]);
    syncAsOfItemValues($item, $collection, ['title' => 'Current headline']);
    $item->refresh();

    $user = grantAsOfPreviewPermissions(User::factory()->create());
    $asOf = now()->addDay();
    $token = app(LivePreviewTokenService::class)->mint(
        $collection->id,
        $item->id,
        'published',
        null,
        now()->addMinutes(5)->getTimestamp(),
        (int) $user->id,
        app(LivePreviewUrlBuilderService::class)->contentHash($item, 'published', $asOf),
        $asOf->getTimestamp(),
    );

    $this->getJson('/api/v1/preview?token='.urlencode($token))
        ->assertOk()
        ->assertJsonPath('meta.source', 'published')
        ->assertJsonPath('data.data.title', 'Current headline');
});

test('public api preview returns 404 when as_of is after unpublish_at', function () {
    $collection = Collection::factory()->create(['versioning' => true]);
    $item = CollectionItem::factory()->create([
        'collection_id' => $collection->id,
        'published_at' => now()->subDay(),
        'unpublish_at' => now()->addDay(),
    ]);
    $user = grantAsOfPreviewPermissions(User::factory()->create());
    $asOf = now()->addDays(2);
    $token = app(LivePreviewTokenService::class)->mint(
        $collection->id,
        $item->id,
        'published',
        null,
        now()->addMinutes(5)->getTimestamp(),
        (int) $user->id,
        app(LivePreviewUrlBuilderService::class)->contentHash($item, 'published', $asOf),
        $asOf->getTimestamp(),
    );

    $this->getJson('/api/v1/preview?token='.urlencode($token))
        ->assertNotFound();
});

test('parseBounded rejects empty and far-future as_of', function () {
    $resolver = app(LivePreviewAsOfResolverService::class);

    expect(fn () => $resolver->parseBounded(''))
        ->toThrow(InvalidArgumentException::class);

    expect(fn () => $resolver->parseBounded(now()->addDays(120)->toIso8601String()))
        ->toThrow(InvalidArgumentException::class);

    $ok = $resolver->parseBounded(now()->addDays(10)->toIso8601String());
    expect($ok)->toBeInstanceOf(Carbon::class);
});
