<?php

use App\Http\Controllers\Ai\CollectionImportWebhookController;
use App\Models\Collection;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Cache;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @return array{0: string, 1: array<string, string>}
 */
function signedCollectionImportCall(string $rawBody, string $secret, ?string $timestamp = null): array
{
    $timestamp ??= (string) now()->timestamp;

    return [
        $timestamp,
        [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_AI_WEBHOOK_TIMESTAMP' => $timestamp,
            'HTTP_X_AI_WEBHOOK_SIGNATURE' => CollectionImportWebhookController::sign($rawBody, $secret, $timestamp),
        ],
    ];
}

test('collection import webhook accepts a valid HMAC signature', function () {
    config()->set('ai.webhook_token', 'signed-secret');
    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'Webhook item'],
        ],
    ];
    $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
    [, $server] = signedCollectionImportCall($rawBody, 'signed-secret');

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        $server,
        $rawBody,
    )->assertSuccessful()
        ->assertJson([
            'ok' => true,
            'collection_id' => $collection->id,
            'created' => 1,
        ]);

    expect($collection->items()->count())->toBe(1);
});

test('collection import webhook returns 401 for an invalid signature', function () {
    config()->set('ai.webhook_token', 'signed-secret');
    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'Webhook item'],
        ],
    ];

    $this->withHeaders([
        'X-AI-Webhook-Timestamp' => (string) now()->timestamp,
        'X-AI-Webhook-Signature' => 'sha256=deadbeef',
    ])
        ->postJson(route('ai.webhooks.collection-import'), $payload)
        ->assertUnauthorized();

    expect($collection->items()->count())->toBe(0);
});

test('collection import webhook returns 401 for a tampered body', function () {
    config()->set('ai.webhook_token', 'signed-secret');
    $collectionA = Collection::factory()->create();
    $collectionB = Collection::factory()->create();

    $payloadA = [
        'collection_id' => $collectionA->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'Only for A'],
        ],
    ];
    $rawBodyA = json_encode($payloadA, JSON_THROW_ON_ERROR);
    [, $server] = signedCollectionImportCall($rawBodyA, 'signed-secret');

    $payloadB = [
        'collection_id' => $collectionB->id,
        'records' => [
            ['sku' => 'B1', 'title' => 'Tampered to B'],
        ],
    ];
    $rawBodyB = json_encode($payloadB, JSON_THROW_ON_ERROR);

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        $server,
        $rawBodyB,
    )->assertUnauthorized();

    expect($collectionA->items()->count())->toBe(0)
        ->and($collectionB->items()->count())->toBe(0);
});

test('collection import webhook returns 401 when the token is unset (fail closed)', function () {
    config()->set([
        'ai.webhook_token' => '',
        'ai.webhook_token_previous' => null,
        'ai.webhook_token_previous_expires_at' => null,
    ]);
    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'Unsigned'],
        ],
    ];
    $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
    [, $server] = signedCollectionImportCall($rawBody, 'anything');

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        $server,
        $rawBody,
    )->assertUnauthorized();

    expect($collection->items()->count())->toBe(0);
});

test('collection import webhook accepts the previous token during grace', function () {
    config()->set([
        'ai.webhook_token' => 'new-secret',
        'ai.webhook_token_previous' => 'old-secret',
        'ai.webhook_token_previous_expires_at' => now()->addHour()->toIso8601String(),
    ]);

    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'Grace item'],
        ],
    ];
    $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
    [, $server] = signedCollectionImportCall($rawBody, 'old-secret');

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        $server,
        $rawBody,
    )->assertSuccessful();

    expect($collection->items()->count())->toBe(1);
});

test('collection import webhook rejects the previous token after grace expiry', function () {
    $this->travelTo(now());

    config()->set([
        'ai.webhook_token' => 'new-secret',
        'ai.webhook_token_previous' => 'old-secret',
        'ai.webhook_token_previous_expires_at' => now()->subMinute()->toIso8601String(),
    ]);

    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'Expired grace'],
        ],
    ];
    $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
    [, $server] = signedCollectionImportCall($rawBody, 'old-secret');

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        $server,
        $rawBody,
    )->assertUnauthorized();

    expect($collection->items()->count())->toBe(0);
});

test('collection import webhook rejects a stale timestamp', function () {
    $this->travelTo(now());

    config()->set('ai.webhook_token', 'signed-secret');
    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'Stale'],
        ],
    ];
    $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
    $staleTs = (string) (now()->timestamp - CollectionImportWebhookController::TIMESTAMP_TOLERANCE_SECONDS - 1);
    [, $server] = signedCollectionImportCall($rawBody, 'signed-secret', $staleTs);

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        $server,
        $rawBody,
    )->assertUnauthorized();

    expect($collection->items()->count())->toBe(0);
});

test('collection import webhook rejects a replayed signature', function () {
    config()->set('ai.webhook_token', 'signed-secret');
    Cache::flush();

    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'Once'],
        ],
    ];
    $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
    [, $server] = signedCollectionImportCall($rawBody, 'signed-secret');

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        $server,
        $rawBody,
    )->assertSuccessful();

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        $server,
        $rawBody,
    )->assertUnauthorized();

    expect($collection->items()->count())->toBe(1);
});

test('collection import webhook returns 401 when timestamp header is missing', function () {
    config()->set('ai.webhook_token', 'signed-secret');
    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [
            ['sku' => 'A1', 'title' => 'No ts'],
        ],
    ];
    $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
    $timestamp = (string) now()->timestamp;

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_AI_WEBHOOK_SIGNATURE' => CollectionImportWebhookController::sign($rawBody, 'signed-secret', $timestamp),
        ],
        $rawBody,
    )->assertUnauthorized();

    expect($collection->items()->count())->toBe(0);
});
