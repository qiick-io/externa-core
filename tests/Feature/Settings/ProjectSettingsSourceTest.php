<?php

declare(strict_types=1);

use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/*
 * The shared source behind the per-area project settings readers: one memoized
 * raw() bag and one decryptSecret() helper.
 */

it('decrypts a stored secret ciphertext', function (): void {
    $projectSettings = app(ProjectSettingsService::class);

    expect($projectSettings->decryptSecret(Crypt::encryptString('s3cret')))->toBe('s3cret')
        ->and($projectSettings->decryptSecret(ProjectSettingsService::encryptSecret('hook-url')))->toBe('hook-url');
});

it('treats unusable secret values as not configured', function (mixed $ciphertext): void {
    expect(app(ProjectSettingsService::class)->decryptSecret($ciphertext))->toBeNull();
})->with([
    'null' => [null],
    'empty string' => [''],
    'non-string' => [['not', 'a', 'string']],
    'integer' => [42],
    'legacy plaintext' => ['plain-legacy-secret'],
    'encrypted empty plaintext' => [fn (): string => Crypt::encryptString('')],
]);

it('reads stored secrets from the project group through the same helper', function (): void {
    $repository = app(SettingsRepositoryService::class);
    $repository->setMany(SettingsRepositoryService::SCOPE_PROJECT, 'project', [
        'webhook_secret' => ProjectSettingsService::encryptWebhookSecret('webhook-plain'),
        'notifier_telegram_bot_token' => 'legacy-plaintext-token',
        'oidc_client_secret' => ProjectSettingsService::encryptOidcClientSecret('oidc-plain'),
    ]);

    $projectSettings = app(ProjectSettingsService::class);

    expect($projectSettings->storedSecret('webhook_secret'))->toBe('webhook-plain')
        ->and($projectSettings->integrations()->webhookSecret())->toBe('webhook-plain')
        ->and($projectSettings->integrations()->notifierTelegramBotToken())->toBeNull()
        ->and($projectSettings->security()->oidcClientSecret())->toBe('oidc-plain')
        ->and($projectSettings->storedSecret('missing_secret'))->toBeNull();
});

it('memoizes the raw bag across every area reader until settings change', function (): void {
    $projectSettings = app(ProjectSettingsService::class);
    $projectSettings->forgetRawCache();

    DB::enableQueryLog();
    DB::flushQueryLog();

    $projectSettings->raw();
    $projectSettings->general()->displayName();
    $projectSettings->security()->isTwoFactorRequired();
    $projectSettings->localization()->defaultContentLocale();
    $projectSettings->files()->presetTransformations();
    $projectSettings->content()->revisionRetentionDays();
    $projectSettings->integrations()->webhookUrl();

    expect(DB::getQueryLog())->toHaveCount(1);

    DB::disableQueryLog();
});

it('forgets the memoized raw bag when project settings are saved', function (): void {
    $projectSettings = app(ProjectSettingsService::class);

    expect($projectSettings->security()->isTwoFactorRequired())->toBeFalse();

    app(SettingsRepositoryService::class)->set(
        SettingsRepositoryService::SCOPE_PROJECT,
        'project',
        'two_factor_required',
        true,
    );

    expect($projectSettings->security()->isTwoFactorRequired())->toBeTrue();
});

it('reuses one reader instance per area', function (): void {
    $projectSettings = app(ProjectSettingsService::class);

    expect($projectSettings->security())->toBe($projectSettings->security())
        ->and($projectSettings->integrations())->toBe($projectSettings->integrations());
});
