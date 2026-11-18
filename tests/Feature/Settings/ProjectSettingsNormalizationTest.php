<?php

declare(strict_types=1);

use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;

/*
 * Characterization of the normalized project settings bag: forEdit() and shared()
 * are snapshotted for the defaults and for a rich, partly invalid fixture, so moving
 * the per-area normalizers between classes cannot change a value, a default or the
 * key order the settings pages receive.
 */

/**
 * Fresh service reading the given stored `project` group values.
 *
 * @param  array<string, mixed>  $storedValues
 */
function projectSettingsWith(array $storedValues): ProjectSettingsService
{
    if ($storedValues !== []) {
        app(SettingsRepositoryService::class)->setMany(
            SettingsRepositoryService::SCOPE_PROJECT,
            'project',
            $storedValues,
        );
    }

    $projectSettings = app(ProjectSettingsService::class);
    $projectSettings->forgetRawCache();

    return $projectSettings;
}

/**
 * @return array<string, mixed>
 */
function richProjectSettingsFixture(): array
{
    return [
        'name' => '  Acme CMS  ',
        'description' => 'Content for Acme',
        'url' => ' https://acme.test ',
        'default_language' => 'xx',
        'content_locales' => ['it', ' en ', 'it', 'de', 'zz-unknown', 42, ''],
        'default_content_locale' => 'fr',
        'fallback_content_locales' => ['de', 'nope', 'de'],
        'sidebar_modules' => [
            ['id' => 'users', 'enabled' => false],
            ['id' => 'unknown-module', 'enabled' => true],
            ['id' => 'dashboard', 'enabled' => false],
            ['id' => 'ai', 'enabled' => false],
            'not-an-array',
            ['id' => 'files', 'enabled' => false],
        ],
        'password_policy' => 'strong',
        'login_max_attempts' => '250',
        'registration_enabled' => 1,
        'default_user_role' => 'editor',
        'email_verification_required' => true,
        'two_factor_required' => '1',
        'allowed_domains' => 'Acme.test, example.ORG  acme.test',
        'public_api_allowed_origins' => ['https://app.acme.test/', 'https://APP.acme.test', 'not a url', 7],
        'allowed_transformations' => ['thumbnail', 'unknown', 'thumbnail'],
        'preset_transformations' => [
            200,
            ['key' => 'Hero', 'fit' => 'cover', 'width' => '1600', 'height' => '', 'quality' => 300, 'format' => 'webp'],
            ['key' => 'bad key!', 'width' => 10],
            ['key' => 'hero', 'width' => 10],
            ['key' => 'tiny', 'fit' => 'weird', 'width' => 0, 'height' => 5000],
            ['key' => 'square', 'width' => 99, 'without_enlargement' => false, 'format' => 'nope'],
            8,
        ],
        'report_issue_url' => ' https://acme.test/issues ',
        'report_bug_url' => '',
        'report_error_url' => null,
        'webhook_url' => 'https://hooks.acme.test/in',
        'webhook_secret' => ProjectSettingsService::encryptWebhookSecret('webhook-plain'),
        'notifier_slack_webhook_url' => ' https://hooks.slack.test/x ',
        'notifier_telegram_bot_token' => ProjectSettingsService::encryptNotifierTelegramBotToken('bot-token'),
        'notifier_telegram_chat_id' => ' 12345 ',
        'notifier_event_types' => ['item.updated', 'ping', 'unknown.event', 7, 'item.created', 'item.updated'],
        'deploy_hooks' => [
            ['id' => ' hook-1 ', 'name' => ' Production ', 'url' => ProjectSettingsService::encryptDeployHookUrl('https://deploy.test/1')],
            ['id' => 'hook-2', 'name' => str_repeat('n', 130), 'url' => ProjectSettingsService::encryptDeployHookUrl('https://deploy.test/2')],
            ['id' => 'hook-3', 'name' => 'No url', 'url' => ''],
            ['id' => '', 'name' => 'No id', 'url' => 'cipher'],
        ],
        'deploy_on_publish' => 'yes',
        'oidc_enabled' => true,
        'oidc_issuer' => ' https://id.acme.test ',
        'oidc_client_id' => ' client-id ',
        'oidc_client_secret' => ProjectSettingsService::encryptOidcClientSecret('oidc-plain'),
        'oidc_button_label' => '   ',
        'oidc_jit_provisioning' => 1,
        'preview_url_default' => ' https://preview.acme.test/{{slug}}?token={{token}} ',
        'revision_retention_count' => '50',
        'revision_retention_days' => 9999,
        'files_max_upload_bytes' => '1048576',
        'chat_max_upload_bytes' => 'abc',
        'upload_allowed_mimes' => ['Image/PNG ', 'image/png', 'nonsense', ''],
        'upload_allowed_extensions' => ['.PNG', 'png', 'php', 'svg', 'j p g', ''],
        'upload_allow_svg' => 1,
    ];
}

it('keeps the default edit payload and shared props unchanged', function (): void {
    $projectSettings = projectSettingsWith([]);

    expect($projectSettings->forEdit())->toMatchSnapshot()
        ->and($projectSettings->shared())->toMatchSnapshot();
});

it('keeps the normalized edit payload and shared props of a rich fixture unchanged', function (): void {
    $projectSettings = projectSettingsWith(richProjectSettingsFixture());

    expect($projectSettings->forEdit())->toMatchSnapshot()
        ->and($projectSettings->shared())->toMatchSnapshot();
});

it('keeps the normalized key order of the stored bag', function (): void {
    expect(array_keys(projectSettingsWith(richProjectSettingsFixture())->raw()))->toMatchSnapshot();
});
