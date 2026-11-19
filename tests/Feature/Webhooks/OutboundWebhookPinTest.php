<?php

declare(strict_types=1);

use App\Ai\Support\SafeRemoteUrlValidator;
use App\Enums\PermissionEnum;
use App\Jobs\DeliverOutboundWebhookJob;
use App\Models\User;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    SafeRemoteUrlValidator::resolveUsing(null);
    config(['webhooks.allow_private_hosts' => false]);
});

afterEach(function (): void {
    SafeRemoteUrlValidator::resolveUsing(null);
});

it('resolves once per delivery and sends the request to the address it checked', function (): void {
    // DNS rebinding: the name answers publicly for the check and privately for anything after
    // it. The guard looks the name up once; curl is handed that answer and never asks again.
    $lookups = 0;
    SafeRemoteUrlValidator::resolveUsing(static function (string $_host) use (&$lookups): array {
        $lookups++;

        return $lookups === 1 ? ['93.184.216.34'] : ['169.254.169.254'];
    });

    $sentOptions = null;

    Http::fake(function (Request $request, array $options) use (&$sentOptions): PromiseInterface {
        $sentOptions = $options;

        return Http::response(['ok' => true], 200);
    });

    $repository = app(SettingsRepositoryService::class);
    $repository->set(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'webhook_url', 'https://rebind.example.com/hook');
    $repository->set(
        SettingsRepositoryService::SCOPE_PROJECT,
        'project',
        'webhook_secret',
        ProjectSettingsService::encryptWebhookSecret('test-signing-secret-value'),
    );

    (new DeliverOutboundWebhookJob(
        '44444444-4444-4444-8444-444444444444',
        'ping',
        now()->toIso8601String(),
        ['id' => 'subject'],
    ))->handle(app(ProjectSettingsService::class));

    expect($lookups)->toBe(1)
        ->and($sentOptions['curl'] ?? null)->toBe([CURLOPT_CONNECT_TO => ['::93.184.216.34:443']]);

    // The next delivery looks again, gets the rebound answer, and is refused before sending.
    Http::fake();

    (new DeliverOutboundWebhookJob(
        '55555555-5555-4555-8555-555555555555',
        'ping',
        now()->toIso8601String(),
        ['id' => 'subject'],
    ))->handle(app(ProjectSettingsService::class));

    Http::assertNothingSent();
    expect($lookups)->toBe(2);
});

it('pins a literal address in the url too, since curl reads more spellings than the guard', function (): void {
    $sentOptions = null;

    Http::fake(function (Request $request, array $options) use (&$sentOptions): PromiseInterface {
        $sentOptions = $options;

        return Http::response(['ok' => true], 200);
    });

    SafeRemoteUrlValidator::resolveUsing(static function (string $host): array {
        throw new RuntimeException("Guard resolved an address literal as a name: {$host}");
    });

    $repository = app(SettingsRepositoryService::class);
    $repository->set(SettingsRepositoryService::SCOPE_PROJECT, 'project', 'webhook_url', 'https://93.184.216.34/hook');
    $repository->set(
        SettingsRepositoryService::SCOPE_PROJECT,
        'project',
        'webhook_secret',
        ProjectSettingsService::encryptWebhookSecret('test-signing-secret-value'),
    );

    (new DeliverOutboundWebhookJob(
        '55555555-5555-4555-8555-555555555555',
        'ping',
        now()->toIso8601String(),
        [],
    ))->handle(app(ProjectSettingsService::class));

    expect($sentOptions['curl'] ?? null)->toBe([CURLOPT_CONNECT_TO => ['::93.184.216.34:443']]);
});

it('refuses the decimal metadata address at the settings form and saves nothing', function (): void {
    config(['webhooks.allow_private_hosts' => true]);

    $user = grantProjectSettingsPermissions(User::factory()->create(), [
        PermissionEnum::CanManageProjectSettings->value,
    ]);

    $this->actingAs($user)
        ->put(route('project.integrations.update'), baseIntegrationsPayload([
            'webhook_url' => 'http://2852039166/latest/meta-data/',
            'webhook_secret' => 'test-secret',
        ]))
        ->assertSessionHasErrors('webhook_url');
});
