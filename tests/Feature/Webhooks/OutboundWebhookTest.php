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
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Http;
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
