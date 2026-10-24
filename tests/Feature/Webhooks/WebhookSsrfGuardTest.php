<?php

use App\Ai\Support\SafeRemoteUrlValidator;
use App\Enums\PermissionEnum;
use App\Jobs\DeliverOutboundWebhookJob;
use App\Jobs\DeliverSlackOutboundNotifierJob;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    config()->set('webhooks.allow_private_hosts', false);
});

dataset('ssrf private webhook urls', [
    'loopback' => ['http://127.0.0.1/hook'],
    'ten-dot' => ['http://10.0.0.5/hook'],
    'link-local-metadata' => ['http://169.254.169.254/latest/meta-data'],
    'localhost' => ['http://localhost/hook'],
]);

it('rejects private webhook urls on project settings save', function (string $url): void {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.integrations.update'), baseIntegrationsPayload([
            'webhook_url' => $url,
            'webhook_secret' => 'test-secret',
        ]))
        ->assertSessionHasErrors('webhook_url');
})->with('ssrf private webhook urls');

it('rejects private slack notifier urls on project settings save', function (string $url): void {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.integrations.update'), baseIntegrationsPayload([
            'notifier_slack_webhook_url' => $url,
        ]))
        ->assertSessionHasErrors('notifier_slack_webhook_url');
})->with('ssrf private webhook urls');

it('allows public https webhook url on save', function (): void {
    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.integrations.update'), baseIntegrationsPayload([
            'webhook_url' => 'https://example.com/externa-hooks',
            'webhook_secret' => 'test-secret',
        ]))
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('project.integrations.edit'));
});

it('refuses delivery when stored webhook url is private', function (): void {
    Http::fake();
    Log::spy();

    $repository = app(SettingsRepository::class);
    $repository->set(SettingsRepository::SCOPE_PROJECT, 'project', 'webhook_url', 'http://127.0.0.1/hook');
    $repository->set(SettingsRepository::SCOPE_PROJECT, 'project', 'webhook_secret', 'secret');

    (new DeliverOutboundWebhookJob('evt_ssrf', 'ping', now()->toIso8601String(), []))->handle(
        app(ProjectSettings::class),
    );

    Http::assertNothingSent();
});

it('refuses slack delivery when url is private', function (): void {
    Http::fake();

    $repository = app(SettingsRepository::class);
    $repository->set(SettingsRepository::SCOPE_PROJECT, 'project', 'notifier_slack_webhook_url', 'http://10.1.2.3/slack');

    (new DeliverSlackOutboundNotifierJob('item.created', 'hello'))->handle(app(ProjectSettings::class));

    Http::assertNothingSent();
});

it('opt-in WEBHOOKS_ALLOW_PRIVATE_HOSTS permits private targets', function (): void {
    config()->set('webhooks.allow_private_hosts', true);

    expect(SafeRemoteUrlValidator::validateOutboundWebhook('http://10.0.0.8/hook'))->toBeNull();
});

it('posts without following redirects on delivery', function (): void {
    Http::fake([
        'https://example.com/*' => Http::response('ok', 200),
    ]);

    $repository = app(SettingsRepository::class);
    $repository->set(SettingsRepository::SCOPE_PROJECT, 'project', 'webhook_url', 'https://example.com/externa-hooks');
    $repository->set(
        SettingsRepository::SCOPE_PROJECT,
        'project',
        'webhook_secret',
        ProjectSettings::encryptWebhookSecret('secret'),
    );

    (new DeliverOutboundWebhookJob('evt_ok', 'ping', now()->toIso8601String(), []))->handle(
        app(ProjectSettings::class),
    );

    Http::assertSent(function ($request): bool {
        return $request->url() === 'https://example.com/externa-hooks';
    });
});
