<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Jobs\DeliverOutboundWebhookJob;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use App\Services\Webhooks\OutboundWebhookCatalog;
use App\Services\Webhooks\OutboundWebhookDeliveryLog;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

function configureOutboundWebhook(string $url = 'https://hooks.example.test/externa', string $secret = 'test-secret'): void
{
    $repository = app(SettingsRepository::class);
    $repository->set(SettingsRepository::SCOPE_PROJECT, 'project', 'webhook_url', $url);
    $repository->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'webhook_secret',
        ProjectSettings::encryptWebhookSecret($secret),
    );
}

test('dispatcher is a no-op when webhook url is empty', function () {
    Queue::fake();

    app(OutboundWebhookDispatcher::class)->dispatch('ping', []);

    Queue::assertNothingPushed();
});

test('dispatcher refuses when webhook url set without secret', function () {
    Queue::fake();
    $repository = app(SettingsRepository::class);
    $repository->set(SettingsRepository::SCOPE_PROJECT, 'project', 'webhook_url', 'https://hooks.example.test/externa');

    app(OutboundWebhookDispatcher::class)->dispatch('ping', ['ok' => true]);

    Queue::assertNothingPushed();
});

test('dispatcher queues deliver job when webhook url is set', function () {
    Queue::fake();
    configureOutboundWebhook();

    app(OutboundWebhookDispatcher::class)->dispatch('ping', ['ok' => true]);

    Queue::assertPushed(DeliverOutboundWebhookJob::class, function (DeliverOutboundWebhookJob $job): bool {
        return $job->type === 'ping'
            && $job->data === ['ok' => true]
            && str_starts_with($job->eventId, 'evt_');
    });
});

test('deliver job posts signed payload', function () {
    configureOutboundWebhook('https://hooks.example.test/externa', 'test-secret');
    Http::fake([
        'hooks.example.test/*' => Http::response(['ok' => true], 200),
    ]);

    $job = new DeliverOutboundWebhookJob(
        'evt_01test',
        'item.updated',
        '2026-07-24T12:00:00Z',
        ['collection_id' => 1, 'collection_slug' => 'posts', 'item_id' => 42],
    );

    $job->handle(app(ProjectSettings::class));

    Http::assertSent(function ($request): bool {
        $body = $request->body();
        $expected = 'sha256='.hash_hmac('sha256', $body, 'test-secret');

        return $request->url() === 'https://hooks.example.test/externa'
            && $request->hasHeader('X-Externa-Signature', $expected)
            && $request->hasHeader('X-Externa-Event-Id', 'evt_01test')
            && $request->hasHeader('X-Externa-Timestamp')
            && $request->header('Content-Type')[0] === 'application/json'
            && str_contains($body, '"type":"item.updated"');
    });
});

test('deliver job records last success and recent entry', function () {
    configureOutboundWebhook();
    Http::fake([
        'hooks.example.test/*' => Http::response(['ok' => true], 202),
    ]);

    $job = new DeliverOutboundWebhookJob('evt_01ok', 'item.created', '2026-07-24T12:00:00Z', ['item_id' => 1]);
    $job->handle(app(ProjectSettings::class));

    $summary = app(OutboundWebhookDeliveryLog::class)->summary();

    expect($summary['last_success'])->toMatchArray([
        'event_id' => 'evt_01ok',
        'type' => 'item.created',
        'outcome' => 'success',
        'status' => 202,
        'attempts' => 1,
    ])
        ->and($summary['last_success']['at'])->toMatch('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/')
        ->and($summary['last_error'])->toBeNull()
        ->and($summary['recent'])->toHaveCount(1)
        ->and($summary['recent'][0]['event_id'])->toBe('evt_01ok');
});

test('deliver job does not record success on non-2xx response', function () {
    configureOutboundWebhook();
    Http::fake([
        'hooks.example.test/*' => Http::response('nope', 500),
    ]);

    $job = new DeliverOutboundWebhookJob('evt_01bad', 'ping', '2026-07-24T12:00:00Z', []);

    expect(fn () => $job->handle(app(ProjectSettings::class)))
        ->toThrow(RuntimeException::class, 'HTTP 500');

    expect(app(OutboundWebhookDeliveryLog::class)->summary()['last_success'])->toBeNull();
});

test('failed job records last error with message', function () {
    $job = new DeliverOutboundWebhookJob('evt_01fail', 'file.deleted', '2026-07-24T12:00:00Z', []);
    $job->failed(new RuntimeException('Outbound webhook delivery failed (evt_01fail): HTTP 503'));

    $summary = app(OutboundWebhookDeliveryLog::class)->summary();

    expect($summary['last_error'])->toMatchArray([
        'event_id' => 'evt_01fail',
        'type' => 'file.deleted',
        'outcome' => 'failed',
        'message' => 'Outbound webhook delivery failed (evt_01fail): HTTP 503',
    ])
        ->and($summary['last_success'])->toBeNull()
        ->and($summary['recent'][0]['outcome'])->toBe('failed');
});

test('recent deliveries keep only the newest entries', function () {
    $log = app(OutboundWebhookDeliveryLog::class);

    for ($i = 1; $i <= OutboundWebhookDeliveryLog::RECENT_LIMIT + 3; $i++) {
        $log->recordSuccess("evt_{$i}", 'ping', 200, 1);
    }

    $recent = $log->summary()['recent'];

    expect($recent)->toHaveCount(OutboundWebhookDeliveryLog::RECENT_LIMIT)
        ->and($recent[0]['event_id'])->toBe('evt_'.(OutboundWebhookDeliveryLog::RECENT_LIMIT + 3))
        ->and(end($recent)['event_id'])->toBe('evt_4');
});

test('catalog covers every event type emitted in app code', function () {
    $emitted = [];
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(app_path()));

    foreach ($files as $file) {
        if ($file->getExtension() !== 'php') {
            continue;
        }
        preg_match_all(
            "/dispatch(?:Item|Collection|File)\(\s*'([a-z_]+\.[a-z_]+)'/",
            (string) file_get_contents($file->getPathname()),
            $matches,
        );
        array_push($emitted, ...$matches[1]);
        preg_match_all("/(?:\\\$(?:this->)?dispatch|->dispatch)\(\s*'([a-z_.]+)'/", (string) file_get_contents($file->getPathname()), $direct);
        array_push($emitted, ...$direct[1]);
    }

    $emitted = array_values(array_unique([...$emitted, 'item.created', 'item.updated']));
    sort($emitted);

    expect($emitted)->not->toBeEmpty();
    foreach ($emitted as $type) {
        expect(OutboundWebhookCatalog::has($type))->toBeTrue("Missing catalog entry: {$type}");
    }

    expect(OutboundWebhookCatalog::types())->toContain(
        'item.created',
        'item.updated',
        'item.deleted',
        'item.restored',
        'collection.created',
        'collection.updated',
        'collection.deleted',
        'file.created',
        'file.updated',
        'file.deleted',
        'ping',
    );
});

test('dispatcher still queues unknown event types for forward compatibility', function () {
    Queue::fake();
    Log::spy();
    configureOutboundWebhook();

    app(OutboundWebhookDispatcher::class)->dispatch('custom.thing', []);

    Queue::assertPushed(DeliverOutboundWebhookJob::class, fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'custom.thing');
    Log::shouldHaveReceived('warning')
        ->withArgs(fn (string $message): bool => str_contains($message, 'missing from catalog'))
        ->once();
});

test('project settings page exposes webhook catalog and delivery status', function () {
    app(OutboundWebhookDeliveryLog::class)->recordSuccess('evt_01page', 'ping', 200, 1);
    app(OutboundWebhookDeliveryLog::class)->recordFailure('evt_01err', 'item.updated', 'HTTP 500', 3);

    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->get(route('project.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/project')
            ->has('webhookEvents', count(OutboundWebhookCatalog::EVENTS))
            ->where('webhookEvents.0.type', 'item.created')
            ->where('webhookDeliveries.last_success.event_id', 'evt_01page')
            ->where('webhookDeliveries.last_error.message', 'HTTP 500')
            ->where('webhookDeliveries.last_error.attempts', 3)
            ->has('webhookDeliveries.recent', 2)
            ->missing('projectSettings.webhookDeliveries')
        );
});

test('deliver job refuses when signing secret is empty', function () {
    $repository = app(SettingsRepository::class);
    $repository->set(SettingsRepository::SCOPE_PROJECT, 'project', 'webhook_url', 'https://hooks.example.test/externa');
    Http::fake();

    $job = new DeliverOutboundWebhookJob(
        'evt_01nosecret',
        'ping',
        '2026-07-24T12:00:00Z',
        [],
    );

    $job->handle(app(ProjectSettings::class));

    Http::assertNothingSent();
});

test('item store update and delete dispatch expected event types', function () {
    Queue::fake();
    configureOutboundWebhook();

    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['slug' => 'posts']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    Queue::fake([DeliverOutboundWebhookJob::class]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'Hello'],
    ])->assertRedirect();

    Queue::assertPushed(DeliverOutboundWebhookJob::class, fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'item.created');

    $item = CollectionItem::query()->firstOrFail();

    Queue::fake([DeliverOutboundWebhookJob::class]);

    $this->put(route('collections.items.update', [$collection, $item]), [
        'data' => ['title' => 'Updated'],
    ])->assertRedirect();

    Queue::assertPushed(DeliverOutboundWebhookJob::class, fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'item.updated');

    Queue::fake([DeliverOutboundWebhookJob::class]);

    $this->delete(route('collections.items.destroy', [$collection, $item]))->assertRedirect();

    Queue::assertPushed(DeliverOutboundWebhookJob::class, fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'item.deleted');
});

test('item restore dispatches item.restored', function () {
    Queue::fake();
    configureOutboundWebhook();

    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create();
    $item = $collection->items()->create([]);
    $item->delete();

    Queue::fake([DeliverOutboundWebhookJob::class]);

    $this->post(route('collections.items.restore', [$collection, $item]))->assertRedirect();

    Queue::assertPushed(DeliverOutboundWebhookJob::class, fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'item.restored');
});

test('withoutWebhooks suppresses emission during bulk import style sync', function () {
    $collection = Collection::factory()->create();
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);
    $collection->load('fields');

    Queue::fake();
    configureOutboundWebhook();

    $writer = app(CollectionItemValuesWriter::class);
    $normalizer = app(CollectionItemDataNormalizer::class);

    OutboundWebhookDispatcher::withoutWebhooks(function () use ($collection, $writer, $normalizer): void {
        for ($i = 0; $i < 3; $i++) {
            $item = $collection->items()->create([]);
            $normalized = $normalizer->normalize($collection, ['title' => "Row {$i}"], true);
            $writer->sync($item, $collection, $normalized);
        }
    });

    Queue::assertNothingPushed();
});

test('clearing webhook url disables outbound webhooks', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.update'), baseProjectPayload([
            'webhook_url' => 'https://hooks.example.test/externa',
            'webhook_secret' => 'keep-me',
        ]))
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('project.edit'));

    expect(app(ProjectSettings::class)->webhookUrl())->toBe('https://hooks.example.test/externa');

    $this->actingAs($user)
        ->put(route('project.update'), baseProjectPayload([
            'webhook_url' => '',
        ]))
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('project.edit'));

    expect(app(ProjectSettings::class)->webhookUrl())->toBeNull()
        ->and(app(ProjectSettings::class)->webhookSecret())->toBe('keep-me');

    $this->actingAs($user)
        ->get(route('project.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('project.webhook_url', null)
            ->where('project.webhook_secret_configured', true)
        );
});

test('project settings stores encrypted webhook secret and never shares it', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.update'), baseProjectPayload([
            'webhook_url' => 'https://hooks.example.test/externa',
            'webhook_secret' => 'super-secret-value',
        ]))
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('project.edit'));

    $stored = app(SettingsRepository::class)->get(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'webhook_secret',
    );

    expect($stored)->toBeString()
        ->and($stored)->not->toBe('super-secret-value')
        ->and(app(ProjectSettings::class)->webhookSecret())->toBe('super-secret-value')
        ->and(app(ProjectSettings::class)->shared())->not->toHaveKey('webhook_secret')
        ->and(app(ProjectSettings::class)->shared())->not->toHaveKey('webhookSecret');

    $this->actingAs($user)
        ->get(route('project.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('settings/project')
            ->where('project.webhook_url', 'https://hooks.example.test/externa')
            ->where('project.webhook_secret_configured', true)
            ->missing('project.webhook_secret')
        );
});

test('send test webhook queues ping when url configured', function () {
    Queue::fake();
    configureOutboundWebhook();

    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->post(route('project.webhook-test'))
        ->assertRedirect(route('project.edit'))
        ->assertSessionHas('success');

    Queue::assertPushed(DeliverOutboundWebhookJob::class, fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'ping');
});

test('send test webhook flashes error when url missing', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->post(route('project.webhook-test'))
        ->assertRedirect(route('project.edit'))
        ->assertSessionHas('error');
});

test('send test webhook flashes error when secret missing', function () {
    $repository = app(SettingsRepository::class);
    $repository->set(SettingsRepository::SCOPE_PROJECT, 'project', 'webhook_url', 'https://hooks.example.test/externa');

    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->post(route('project.webhook-test'))
        ->assertRedirect(route('project.edit'))
        ->assertSessionHas('error');
});

test('inertia shares flash success and error', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->withSession(['success' => 'Webhook ok'])
        ->get(route('project.edit'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('flash.success', 'Webhook ok')
        );
});

test('end-to-end item create delivers signed http request with sync queue', function () {
    config(['queue.default' => 'sync']);
    configureOutboundWebhook('https://hooks.example.test/externa', 'e2e-secret');
    Http::fake([
        'hooks.example.test/*' => Http::response(['received' => true], 200),
    ]);

    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['slug' => 'posts']);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
        'translatable' => false,
    ]);

    $this->post(route('collections.items.store', $collection), [
        'data' => ['title' => 'Webhook me'],
    ])->assertRedirect();

    Http::assertSent(function ($request): bool {
        $body = $request->body();
        $payload = json_decode($body, true);
        $expected = 'sha256='.hash_hmac('sha256', $body, 'e2e-secret');

        return $request->url() === 'https://hooks.example.test/externa'
            && $request->header('X-Externa-Signature')[0] === $expected
            && ($payload['type'] ?? null) === 'item.created'
            && ($payload['data']['collection_slug'] ?? null) === 'posts'
            && isset($payload['data']['item_id']);
    });
});
