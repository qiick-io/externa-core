<?php

use App\Http\Controllers\Ai\CollectionImportWebhookController;
use App\Models\Collection;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\File;
use Spatie\Activitylog\Models\Activity;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

it('requires --show or --write-env', function (): void {
    $this->artisan('ai:rotate-webhook-token')
        ->assertFailed()
        ->expectsOutputToContain('--show');
});

it('generates a 64-hex token and prints it with --show', function (): void {
    config(['ai.webhook_token' => 'old-secret']);

    $this->artisan('ai:rotate-webhook-token', ['--show' => true, '--grace' => '1h'])
        ->assertSuccessful();

    $new = (string) config('ai.webhook_token');
    expect($new)->toHaveLength(64)
        ->and($new)->toMatch('/^[a-f0-9]{64}$/')
        ->and($new)->not->toBe('old-secret')
        ->and(config('ai.webhook_token_previous'))->toBe('old-secret');
});

it('accepts old and new tokens during grace after rotate', function (): void {
    config(['ai.webhook_token' => 'old-secret']);

    $this->artisan('ai:rotate-webhook-token', ['--show' => true, '--grace' => '2h'])
        ->assertSuccessful();

    $new = (string) config('ai.webhook_token');
    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [['sku' => 'G1', 'title' => 'Grace']],
    ];
    $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);

    foreach (['old-secret', $new] as $secret) {
        $this->call(
            'POST',
            route('ai.webhooks.collection-import'),
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_X_AI_WEBHOOK_SIGNATURE' => CollectionImportWebhookController::sign($rawBody, $secret),
            ],
            $rawBody,
        )->assertSuccessful();
    }

    expect($collection->items()->count())->toBe(2);
});

it('rejects the previous token after grace expiry (time travel)', function (): void {
    $this->travelTo(now());
    config(['ai.webhook_token' => 'old-secret']);

    $this->artisan('ai:rotate-webhook-token', ['--show' => true, '--grace' => '1h'])
        ->assertSuccessful();

    $this->travel(2)->hours();

    $collection = Collection::factory()->create();
    $payload = [
        'collection_id' => $collection->id,
        'records' => [['sku' => 'X1', 'title' => 'Late']],
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
            'HTTP_X_AI_WEBHOOK_SIGNATURE' => CollectionImportWebhookController::sign($rawBody, 'old-secret'),
        ],
        $rawBody,
    )->assertUnauthorized();
});

it('logs rotation without embedding the token', function (): void {
    config(['ai.webhook_token' => 'old-secret']);

    $this->artisan('ai:rotate-webhook-token', ['--show' => true, '--grace' => '24h'])
        ->assertSuccessful();

    $new = (string) config('ai.webhook_token');
    $entry = Activity::query()->where('event', 'webhook_token_rotated')->latest('id')->first();

    expect($entry)->not->toBeNull()
        ->and($entry->properties->get('source'))->toBe('cli')
        ->and($entry->properties->get('grace_until'))->not->toBeNull()
        ->and(json_encode($entry->properties->toArray()))->not->toContain($new)
        ->and(json_encode($entry->properties->toArray()))->not->toContain('old-secret')
        ->and($entry->description)->not->toContain($new);
});

it('writes token keys into a temporary .env with --write-env', function (): void {
    $envPath = base_path('.env');
    $backup = File::exists($envPath) ? File::get($envPath) : null;

    try {
        File::put($envPath, "APP_ENV=testing\nAI_WEBHOOK_TOKEN=old-secret\n");
        config(['ai.webhook_token' => 'old-secret']);

        $this->artisan('ai:rotate-webhook-token', [
            '--write-env' => true,
            '--grace' => '30m',
        ])->assertSuccessful();

        $contents = File::get($envPath);
        $new = (string) config('ai.webhook_token');

        expect($contents)->toContain('AI_WEBHOOK_TOKEN='.$new)
            ->and($contents)->toContain('AI_WEBHOOK_TOKEN_PREVIOUS=old-secret')
            ->and($contents)->toContain('AI_WEBHOOK_TOKEN_PREVIOUS_EXPIRES_AT=')
            ->and($contents)->not->toContain('AI_WEBHOOK_TOKEN=old-secret');
    } finally {
        if ($backup === null) {
            File::delete($envPath);
        } else {
            File::put($envPath, $backup);
        }
    }
});
