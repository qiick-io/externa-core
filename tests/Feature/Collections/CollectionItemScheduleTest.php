<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Jobs\DeliverOutboundWebhookJob;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\User;
use App\Notifications\ItemScheduleFailedNotification;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemPublisherService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use App\Services\Webhooks\OutboundWebhookCatalogService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

test('schedule publish promotes draft when due via artisan command', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriterService::class);
    $normalizer = app(CollectionItemDataNormalizerService::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'live'], true));

    $item->draft_data = ['title' => 'soon'];
    $item->publish_at = now()->addHour();
    $item->save();

    $this->travelTo(now()->addHours(2));

    $this->artisan('collections:process-schedules')
        ->assertSuccessful();

    $item->refresh();
    expect($item->draft_data)->toBeNull();
    expect($item->publish_at)->toBeNull();
    expect(app(CollectionItemValuesAssemblerService::class)->assemble($item)['title'])->toBe('soon');
});

test('cancel schedule clears publish_at before due', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    $item = $collection->items()->create([
        'draft_data' => ['title' => 'wip'],
        'publish_at' => now()->addDay(),
    ]);

    $this->post(route('collections.items.schedule', [$collection, $item]), [
        'clear' => true,
    ])->assertRedirect();

    $item->refresh();
    expect($item->publish_at)->toBeNull();
    expect($item->draft_data['title'] ?? null)->toBe('wip');
});

test('schedule publish requires draft and edit permission', function () {
    $user = grantCollectionPermissions(User::factory()->create(), [
        PermissionEnum::CanShowCollections->value,
    ]);
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    $item = $collection->items()->create(['draft_data' => ['title' => 'x']]);

    $this->post(route('collections.items.schedule', [$collection, $item]), [
        'publish_at' => now()->addHour()->toIso8601String(),
    ])->assertForbidden();

    $editor = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($editor);

    $empty = $collection->items()->create([]);
    $this->post(route('collections.items.schedule', [$collection, $empty]), [
        'publish_at' => now()->addHour()->toIso8601String(),
    ])->assertRedirect()->assertSessionHas('error');
});

test('scheduled unpublish soft-deletes when due', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    $item = $collection->items()->create([
        'unpublish_at' => now()->addHour(),
    ]);

    $this->travelTo(now()->addHours(2));
    $this->artisan('collections:process-schedules')->assertSuccessful();

    expect(CollectionItem::withTrashed()->find($item->id)?->trashed())->toBeTrue();
});

test('published workspace can schedule unpublish without publish_at', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    $scheduledPublish = now()->addDays(3);
    $item = $collection->items()->create([
        'published_at' => now()->subDay(),
        'publish_at' => $scheduledPublish,
        'draft_data' => ['title' => 'next'],
    ]);

    $unpublishAt = now()->addDay()->toIso8601String();

    $this->post(
        route('collections.items.schedule', [$collection, $item]).'?version=published',
        ['unpublish_at' => $unpublishAt],
    )->assertRedirect();

    $item->refresh();
    expect($item->unpublish_at)->not->toBeNull()
        ->and($item->publish_at?->timestamp)->toBe($scheduledPublish->timestamp);
});

test('publish sets published_at timestamp', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create(['versioning' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriterService::class);
    $normalizer = app(CollectionItemDataNormalizerService::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'live'], true));

    $item->draft_data = ['title' => 'staging'];
    $item->save();

    $this->post(route('collections.items.publish', [$collection, $item]))
        ->assertRedirect();

    $item->refresh();
    expect($item->published_at)->not->toBeNull();
});

test('catalog includes item.published', function () {
    expect(OutboundWebhookCatalogService::has('item.published'))->toBeTrue();
    expect(OutboundWebhookCatalogService::types())->toContain('item.published');
});

test('catalog includes item.publish_failed', function () {
    expect(OutboundWebhookCatalogService::has('item.publish_failed'))->toBeTrue();
    expect(OutboundWebhookCatalogService::types())->toContain('item.publish_failed');
});

test('editing approved scheduled draft warns that publish will not run', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'versioning' => true,
        'approvals_required' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([
        'draft_data' => ['title' => 'staging'],
        'approval_status' => 'approved',
        'publish_at' => now()->addDay(),
    ]);

    $this->put(route('collections.items.update', [$collection, $item]), [
        'version' => 'draft',
        'data' => ['title' => 'edited'],
    ])->assertRedirect()
        ->assertSessionHas('success', function (string $message): bool {
            return str_contains($message, 'Approval was reset')
                && str_contains($message, 'will not run until the item is approved again');
        });

    $item->refresh();
    expect($item->approval_status)->toBe('draft')
        ->and($item->publish_at)->not->toBeNull()
        ->and($item->draft_data['title'] ?? null)->toBe('edited');
});

test('scheduled publish failure persists error, notifies, and emits webhook', function () {
    Notification::fake();
    Queue::fake();

    $repository = app(SettingsRepositoryService::class);
    $repository->set(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'webhook_url', 'https://hooks.example.test/externa');
    $repository->set(
        SettingsRepositoryService::SCOPE_PROJECT,
        'project',
        'webhook_secret',
        ProjectSettingsService::encryptWebhookSecret('test-signing-secret'),
    );

    $editor = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($editor);

    $collection = Collection::factory()->create([
        'versioning' => true,
        'approvals_required' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([
        'draft_data' => ['title' => 'staging'],
        'approval_status' => 'draft',
        'publish_at' => now()->subMinute(),
        'unpublish_at' => now()->addDays(7),
        'user_updated_id' => $editor->id,
        'submitted_by' => $editor->id,
    ]);

    $this->artisan('collections:process-schedules')->assertSuccessful();

    $item->refresh();
    expect($item->publish_at)->toBeNull()
        ->and($item->schedule_error)->toBe('Item must be approved before publishing.')
        ->and($item->schedule_failed_at)->not->toBeNull()
        ->and($item->unpublish_at)->not->toBeNull()
        ->and($item->draft_data['title'] ?? null)->toBe('staging');

    Notification::assertSentTo($editor, ItemScheduleFailedNotification::class);
    Queue::assertPushed(
        DeliverOutboundWebhookJob::class,
        fn (DeliverOutboundWebhookJob $job): bool => $job->type === 'item.publish_failed',
    );
});

test('scheduled publish failure for non-approval promote errors uses same handling', function () {
    Notification::fake();

    $editor = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($editor);

    $collection = Collection::factory()->create(['versioning' => true]);
    $item = $collection->items()->create([
        'draft_data' => ['title' => 'staging'],
        'publish_at' => now()->subMinute(),
        'user_updated_id' => $editor->id,
    ]);

    $this->mock(CollectionItemPublisherService::class, function ($mock): void {
        $mock->shouldReceive('promote')
            ->once()
            ->andThrow(new RuntimeException('Simulated promote failure'));
    });

    $this->artisan('collections:process-schedules')->assertSuccessful();

    $item->refresh();
    expect($item->schedule_error)->toBe('Simulated promote failure')
        ->and($item->schedule_failed_at)->not->toBeNull()
        ->and($item->publish_at)->toBeNull();

    Notification::assertSentTo($editor, ItemScheduleFailedNotification::class);
});

test('reschedule clears previous schedule failure state', function () {
    $user = grantCollectionPermissions(User::factory()->create());
    $this->actingAs($user);

    $collection = Collection::factory()->create([
        'versioning' => true,
        'approvals_required' => true,
    ]);
    $item = $collection->items()->create([
        'draft_data' => ['title' => 'wip'],
        'approval_status' => 'approved',
        'schedule_error' => 'Item must be approved before publishing.',
        'schedule_failed_at' => now()->subHour(),
    ]);

    $this->post(route('collections.items.schedule', [$collection, $item]), [
        'publish_at' => now()->addHour()->toIso8601String(),
    ])->assertRedirect();

    $item->refresh();
    expect($item->publish_at)->not->toBeNull()
        ->and($item->schedule_error)->toBeNull()
        ->and($item->schedule_failed_at)->toBeNull();
});

test('promote rolls back synced values when draft clear fails mid-flight', function () {
    $collection = Collection::factory()->create(['versioning' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    $item = $collection->items()->create([]);
    $writer = app(CollectionItemValuesWriterService::class);
    $normalizer = app(CollectionItemDataNormalizerService::class);
    $writer->sync($item, $collection, $normalizer->normalize($collection, ['title' => 'live'], true));

    $item->draft_data = ['title' => 'soon'];
    $item->publish_at = now()->subMinute();
    $item->save();

    $realWriter = app(CollectionItemValuesWriterService::class);
    $this->mock(CollectionItemValuesWriterService::class, function ($mock) use ($realWriter): void {
        $mock->shouldReceive('sync')->once()->andReturnUsing(
            function (...$args) use ($realWriter): void {
                $realWriter->sync(...$args);
                throw new RuntimeException('simulated post-sync failure');
            },
        );
    });

    expect(fn () => app(CollectionItemPublisherService::class)->promote(
        $item->fresh(),
        $collection,
        scheduled: true,
    ))->toThrow(RuntimeException::class, 'simulated post-sync failure');

    $item->refresh();
    expect($item->draft_data)->toBe(['title' => 'soon'])
        ->and(app(CollectionItemValuesAssemblerService::class)->assemble($item)['title'])->toBe('live');
});

test('schedule definitions prevent overlapping multi-server runs', function () {
    $schedule = app(Schedule::class);
    $commands = collect($schedule->events())
        ->map(fn ($event) => [
            'command' => $event->command ?? $event->description,
            'withoutOverlapping' => $event->withoutOverlapping,
            'onOneServer' => $event->onOneServer,
        ]);

    foreach (['collections:process-schedules', 'ai:run-sync-sources'] as $needle) {
        $match = $commands->first(fn (array $row): bool => is_string($row['command']) && str_contains($row['command'], $needle));
        expect($match)->not->toBeNull("missing schedule for {$needle}")
            ->and($match['withoutOverlapping'])->toBeTrue()
            ->and($match['onOneServer'])->toBeTrue();
    }
});
