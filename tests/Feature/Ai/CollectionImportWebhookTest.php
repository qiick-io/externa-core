<?php

use App\Http\Controllers\Ai\CollectionImportWebhookController;
use App\Models\Collection;
use Database\Seeders\PermissionSeeder;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

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
    $validSignature = CollectionImportWebhookController::sign($rawBody, 'signed-secret');

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_AI_WEBHOOK_SIGNATURE' => $validSignature,
        ],
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

    $this->withHeaders(['X-AI-Webhook-Signature' => 'sha256=deadbeef'])
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
    $signatureForA = CollectionImportWebhookController::sign($rawBodyA, 'signed-secret');

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
        [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_AI_WEBHOOK_SIGNATURE' => $signatureForA,
        ],
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

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_AI_WEBHOOK_SIGNATURE' => CollectionImportWebhookController::sign($rawBody, 'anything'),
        ],
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
    $signature = CollectionImportWebhookController::sign($rawBody, 'old-secret');

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_AI_WEBHOOK_SIGNATURE' => $signature,
        ],
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
    $signature = CollectionImportWebhookController::sign($rawBody, 'old-secret');

    $this->call(
        'POST',
        route('ai.webhooks.collection-import'),
        [],
        [],
        [],
        [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_AI_WEBHOOK_SIGNATURE' => $signature,
        ],
        $rawBody,
    )->assertUnauthorized();

    expect($collection->items()->count())->toBe(0);
});
