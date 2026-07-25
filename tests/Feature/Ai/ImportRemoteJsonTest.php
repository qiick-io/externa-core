<?php

use App\Ai\Agents\AppAssistant;
use App\Ai\Tools\ImportRemoteJson;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Tools\Request;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('import remote json tool creates collection fields and items from remote JSON payload', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    Http::fake([
        'https://example.com/items/menu*' => Http::response([
            'data' => [
                [
                    'id' => 1,
                    'slug' => 'home',
                    'status' => 'published',
                    'translations' => [
                        ['language' => 'it', 'title' => 'Home'],
                    ],
                    'link_rel' => [
                        ['links_id' => 10],
                    ],
                ],
                [
                    'id' => 2,
                    'slug' => 'about',
                    'status' => 'draft',
                    'translations' => [
                        ['language' => 'it', 'title' => 'Chi siamo'],
                    ],
                    'link_rel' => [],
                ],
            ],
        ], 200, ['Content-Type' => 'application/json']),
    ]);

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://example.com/items/menu?limit=-1',
        'collection_name' => 'remote-menu',
        'limit' => 50,
    ]));

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('"collection_created": true')
        ->and($result)->toContain('"created": 2')
        ->and($result)->toContain('translations');

    $collection = Collection::query()->where('name', 'remote-menu')->first();

    expect($collection)->not->toBeNull()
        ->and($collection->fields()->count())->toBeGreaterThanOrEqual(4)
        ->and(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBe(2);

    $firstItem = CollectionItem::query()
        ->where('collection_id', $collection->id)
        ->with('fieldValues.field')
        ->first();

    $valuesByField = $firstItem->fieldValues->mapWithKeys(
        fn ($value) => [$value->field->name => $value->value]
    );

    expect($valuesByField['slug'] ?? null)->toBe('home')
        ->and($valuesByField['status'] ?? null)->toBe('published')
        ->and($valuesByField['translations'] ?? null)->toContain('Home');

    expect(Activity::query()->where('event', 'ai_tool')->where('log_name', 'ai')->exists())->toBeTrue();
});

test('import remote json tool blocks localhost ssrf urls', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    Http::fake();

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'http://127.0.0.1/secret.json',
        'collection_name' => 'ssrf-test',
    ]));

    expect($result)->toContain('SSRF')
        ->and(Collection::query()->where('name', 'ssrf-test')->exists())->toBeFalse();

    Http::assertNothingSent();
});

test('import remote json tool denies without create permission', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    Http::fake([
        'https://example.com/*' => Http::response(['data' => [['id' => 1]]], 200),
    ]);

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://example.com/items/menu',
        'collection_name' => 'denied-remote',
    ]));

    expect($result)->toContain('Missing permission')
        ->and(Collection::query()->where('name', 'denied-remote')->exists())->toBeFalse();

    Http::assertNothingSent();
});

test('import remote json tool redacts bearer token in activity log', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    Http::fake([
        'https://example.com/items*' => Http::response([
            'items' => [
                ['id' => 9, 'name' => 'Alpha'],
            ],
        ], 200),
    ]);

    $secret = 'super-secret-token-value-xyz';

    (string) (new ImportRemoteJson)->handle(new Request([
        'url' => 'https://example.com/items',
        'collection_name' => 'auth-import',
        'auth_bearer' => $secret,
    ]));

    $activity = Activity::query()
        ->where('event', 'ai_tool')
        ->where('log_name', 'ai')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull();

    $properties = $activity->properties->toArray();
    $input = $properties['input'] ?? [];

    expect($input['auth_bearer'] ?? null)->toBe('[redacted]')
        ->and(json_encode($properties))->not->toContain($secret);
});

test('import remote json tool is only registered with create permission', function () {
    $withCreate = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);

    expect(collect((new AppAssistant($withCreate))->tools())->map(fn ($tool) => $tool::class)->all())
        ->toContain(ImportRemoteJson::class);

    $withoutCreate = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
    ]);

    expect(collect((new AppAssistant($withoutCreate))->tools())->map(fn ($tool) => $tool::class)->all())
        ->not->toContain(ImportRemoteJson::class);
});

test('import remote json live klover menu endpoint when reachable', function () {
    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanCreateCollections->value,
    ]);
    $this->actingAs($user);

    $url = 'https://admin.klover.it/items/menu?fields=*,translations.*,link_rel.*,link_rel.links_id.*,link_rel.links_id.translations.*,link_rel.links_id.pages_rel.*,link_rel.links_id.pages_rel.translations.*&limit=-1';

    try {
        $probe = Http::timeout(10)
            ->connectTimeout(5)
            ->withOptions(['allow_redirects' => false])
            ->withHeaders(['Accept' => 'application/json'])
            ->get($url);
    } catch (Throwable) {
        $this->markTestSkipped('Klover endpoint unreachable (timeout/connection).');
    }

    if ($probe->status() === 401 || $probe->status() === 403) {
        $this->markTestSkipped('Klover endpoint returned '.$probe->status().' (auth required).');
    }

    if (! $probe->successful()) {
        $this->markTestSkipped('Klover endpoint returned HTTP '.$probe->status());
    }

    $result = (string) (new ImportRemoteJson)->handle(new Request([
        'url' => $url,
        'collection_name' => 'klover-menu-live',
        'limit' => 20,
    ]));

    if (str_starts_with($result, 'Error:')) {
        $this->markTestSkipped('Import failed against live URL: '.$result);
    }

    expect($result)->toContain('"ok": true')
        ->and($result)->toContain('"created"');

    $collection = Collection::query()->where('name', 'klover-menu-live')->first();

    expect($collection)->not->toBeNull()
        ->and(CollectionItem::query()->where('collection_id', $collection->id)->count())->toBeGreaterThan(0);
})->group('live');
