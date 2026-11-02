<?php

use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Jobs\DeliverDeployHookJob;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use App\Services\Collections\CollectionItemPublisherService;
use App\Services\Deploy\DeployHookStatusService;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Spatie\Activitylog\Models\Activity;

beforeEach(function () {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
});

/**
 * @param  list<array{id?: string, name: string, url: string}>  $hooks
 */
function configureDeployHooks(array $hooks, bool $deployOnPublish = false): void
{
    $repository = app(SettingsRepositoryService::class);
    $stored = [];

    foreach ($hooks as $hook) {
        $stored[] = [
            'id' => $hook['id'] ?? 'hook_'.uniqid(),
            'name' => $hook['name'],
            'url' => ProjectSettingsService::encryptDeployHookUrl($hook['url']),
        ];
    }

    $repository->setMany(SettingsRepositoryService::SCOPE_PROJECT, 'project', [
        'deploy_hooks' => $stored,
        'deploy_on_publish' => $deployOnPublish,
    ]);
}

test('triggering a deploy hook posts to the stored url', function () {
    configureDeployHooks([
        ['id' => 'hook_prod', 'name' => 'Production', 'url' => 'https://api.vercel.com/v1/integrations/deploy/abc'],
    ]);

    Http::fake([
        'api.vercel.com/*' => Http::response(['job' => ['id' => '1']], 201),
    ]);

    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::DeployTrigger->value,
    ]);

    // QUEUE_CONNECTION=sync in phpunit — trigger runs DeliverDeployHookJob immediately.
    $this->actingAs($user)
        ->post(route('project.integrations.deploy'))
        ->assertRedirect();

    Http::assertSent(function ($request): bool {
        return $request->url() === 'https://api.vercel.com/v1/integrations/deploy/abc'
            && $request->method() === 'POST';
    });

    $lastRun = app(DeployHookStatusService::class)->lastRun();
    expect($lastRun)->not->toBeNull()
        ->and($lastRun['outcome'])->toBe('success')
        ->and($lastRun['hook_id'])->toBe('hook_prod')
        ->and($lastRun['status'])->toBe(201);
});

test('user without deploy.trigger receives 403', function () {
    configureDeployHooks([
        ['id' => 'hook_prod', 'name' => 'Production', 'url' => 'https://example.com/deploy'],
    ]);

    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->post(route('project.integrations.deploy'))
        ->assertForbidden();
});

test('private loopback deploy hook url is rejected by ssrf guard', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.integrations.update'), baseIntegrationsPayload([
            'deploy_hooks' => [
                ['name' => 'Local', 'url' => 'http://127.0.0.1/deploy'],
            ],
        ]))
        ->assertSessionHasErrors('deploy_hooks.0.url');

    expect(app(ProjectSettingsService::class)->deployHooks())->toBe([]);
});

test('deploy hook url is stored encrypted', function () {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.integrations.update'), baseIntegrationsPayload([
            'deploy_hooks' => [
                ['name' => 'Netlify', 'url' => 'https://api.netlify.com/build_hooks/abc123'],
            ],
        ]))
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('project.integrations.edit'));

    $stored = app(SettingsRepositoryService::class)->get(
        SettingsRepositoryService::SCOPE_PROJECT,
        'project',
        'deploy_hooks',
    );

    expect($stored)->toBeArray()->toHaveCount(1);
    expect($stored[0]['url'])->not->toBe('https://api.netlify.com/build_hooks/abc123');
    expect(Crypt::decryptString($stored[0]['url']))->toBe('https://api.netlify.com/build_hooks/abc123');

    $edit = app(ProjectSettingsService::class)->forEditOnly(['deploy_hooks']);
    expect($edit['deploy_hooks'][0])->toMatchArray([
        'name' => 'Netlify',
        'url_configured' => true,
    ])->not->toHaveKey('url');
});

test('triggering deploy writes an activity log entry', function () {
    configureDeployHooks([
        ['id' => 'hook_prod', 'name' => 'Production', 'url' => 'https://example.com/deploy'],
    ]);
    Queue::fake([DeliverDeployHookJob::class]);

    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::DeployTrigger->value,
    ]);

    $this->actingAs($user)
        ->post(route('project.integrations.deploy'))
        ->assertRedirect();

    $activity = Activity::query()
        ->inLog('deploy')
        ->forEvent('deploy_triggered')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull()
        ->and($activity->causer_id)->toBe($user->id)
        ->and($activity->properties->get('hook_ids'))->toBe(['hook_prod'])
        ->and($activity->properties->get('source'))->toBe('manual');
});

test('deploy on publish fires once per publish', function () {
    Queue::fake([DeliverDeployHookJob::class]);

    configureDeployHooks([
        ['id' => 'hook_a', 'name' => 'A', 'url' => 'https://example.com/a'],
        ['id' => 'hook_b', 'name' => 'B', 'url' => 'https://example.com/b'],
    ], deployOnPublish: true);

    $collection = Collection::factory()->create(['versioning' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([
        'draft_data' => ['title' => 'Hello'],
    ]);

    app(CollectionItemPublisherService::class)->promote($item, $collection);

    Queue::assertPushed(DeliverDeployHookJob::class, 2);
    Queue::assertPushed(DeliverDeployHookJob::class, function (DeliverDeployHookJob $job): bool {
        return $job->source === 'publish' && $job->hookId === 'hook_a';
    });
    Queue::assertPushed(DeliverDeployHookJob::class, function (DeliverDeployHookJob $job): bool {
        return $job->source === 'publish' && $job->hookId === 'hook_b';
    });

    $activity = Activity::query()
        ->inLog('deploy')
        ->forEvent('deploy_triggered')
        ->latest('id')
        ->first();

    expect($activity)->not->toBeNull()
        ->and($activity->properties->get('source'))->toBe('publish')
        ->and($activity->properties->get('hook_ids'))->toHaveCount(2);
});

test('deploy on publish is a no-op when disabled', function () {
    Queue::fake([DeliverDeployHookJob::class]);

    configureDeployHooks([
        ['id' => 'hook_a', 'name' => 'A', 'url' => 'https://example.com/a'],
    ], deployOnPublish: false);

    $collection = Collection::factory()->create(['versioning' => true]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);
    $item = $collection->items()->create([
        'draft_data' => ['title' => 'Hello'],
    ]);

    app(CollectionItemPublisherService::class)->promote($item, $collection);

    Queue::assertNotPushed(DeliverDeployHookJob::class);
});
