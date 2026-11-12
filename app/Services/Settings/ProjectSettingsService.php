<?php

declare(strict_types=1);

namespace App\Services\Settings;

use App\Services\Settings\Project\ProjectApiSettingsService;
use App\Services\Settings\Project\ProjectContentSettingsService;
use App\Services\Settings\Project\ProjectFilesSettingsService;
use App\Services\Settings\Project\ProjectGeneralSettingsService;
use App\Services\Settings\Project\ProjectIntegrationsSettingsService;
use App\Services\Settings\Project\ProjectLocalizationSettingsService;
use App\Services\Settings\Project\ProjectSecuritySettingsService;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\Rules\Password;

/**
 * Resolves project-level settings for admin forms and runtime wiring.
 *
 * This class owns the one shared source every area reads from: the memoized,
 * normalized {@see raw()} bag and the {@see decryptSecret()} helper. Each area's keys
 * are normalized and read by its per-section reader under `App\Services\Settings\Project`
 * (General, Localization, Security, API, Content, Files, Integrations, matching the
 * settings pages); {@see normalize()} only composes their pieces. The getters below are
 * thin delegates kept until their callers move to the readers; Integrations callers
 * already use {@see integrations()} directly.
 */
class ProjectSettingsService
{
    public const PUBLIC_API_ORIGINS_CACHE_KEY = ProjectApiSettingsService::PUBLIC_API_ORIGINS_CACHE_KEY;

    /** @var array<string, mixed>|null Request-lifetime memo (singleton binding). */
    private ?array $memoizedRaw = null;

    private ?ProjectGeneralSettingsService $generalSettings = null;

    private ?ProjectLocalizationSettingsService $localizationSettings = null;

    private ?ProjectSecuritySettingsService $securitySettings = null;

    private ?ProjectApiSettingsService $apiSettings = null;

    private ?ProjectContentSettingsService $contentSettings = null;

    private ?ProjectFilesSettingsService $filesSettings = null;

    private ?ProjectIntegrationsSettingsService $integrationsSettings = null;

    public function __construct(
        private readonly SettingsRepositoryService $settings,
    ) {}

    /**
     * Raw project settings bag merged with defaults.
     *
     * @return array<string, mixed>
     */
    public function raw(): array
    {
        if ($this->memoizedRaw !== null) {
            return $this->memoizedRaw;
        }

        $raw = $this->settings->project(
            'project',
            config('settings.project.defaults', []),
        );

        return $this->memoizedRaw = $this->normalize($raw);
    }

    /**
     * Drop the request-lifetime raw bag after project settings change.
     */
    public function forgetRawCache(): void
    {
        $this->memoizedRaw = null;
    }

    /**
     * Decrypt a stored secret (or deploy-hook URL) ciphertext.
     *
     * Null for anything that is not a non-empty string, for ciphertext the app key
     * cannot decrypt (legacy plaintext, rotated key) and for an empty plaintext, so
     * callers treat every unusable value as "not configured".
     */
    public function decryptSecret(mixed $ciphertext): ?string
    {
        if (! is_string($ciphertext) || $ciphertext === '') {
            return null;
        }

        try {
            $plain = Crypt::decryptString($ciphertext);

            return $plain !== '' ? $plain : null;
        } catch (DecryptException) {
            return null;
        }
    }

    /**
     * Decrypted value of an encrypted key in the `project` settings group.
     *
     * Reads the repository directly (not {@see raw()}), as the secret getters always have.
     */
    public function storedSecret(string $key): ?string
    {
        return $this->decryptSecret($this->settings->get(
            SettingsRepositoryService::SCOPE_PROJECT,
            'project',
            $key,
        ));
    }

    /**
     * Encrypt a plaintext secret (or deploy-hook URL) for storage.
     */
    public static function encryptSecret(string $plain): string
    {
        return Crypt::encryptString($plain);
    }

    public function general(): ProjectGeneralSettingsService
    {
        return $this->generalSettings ??= new ProjectGeneralSettingsService($this);
    }

    public function localization(): ProjectLocalizationSettingsService
    {
        return $this->localizationSettings ??= new ProjectLocalizationSettingsService($this);
    }

    public function security(): ProjectSecuritySettingsService
    {
        return $this->securitySettings ??= new ProjectSecuritySettingsService($this);
    }

    public function api(): ProjectApiSettingsService
    {
        return $this->apiSettings ??= new ProjectApiSettingsService($this);
    }

    public function content(): ProjectContentSettingsService
    {
        return $this->contentSettings ??= new ProjectContentSettingsService($this);
    }

    public function files(): ProjectFilesSettingsService
    {
        return $this->filesSettings ??= new ProjectFilesSettingsService($this);
    }

    public function integrations(): ProjectIntegrationsSettingsService
    {
        return $this->integrationsSettings ??= new ProjectIntegrationsSettingsService($this);
    }

    /**
     * Edit-form payload (never includes webhook secret plaintext).
     *
     * @return array<string, mixed>
     */
    public function forEdit(): array
    {
        $raw = $this->raw();
        unset($raw['webhook_secret'], $raw['notifier_telegram_bot_token'], $raw['oidc_client_secret']);
        $raw['webhook_secret_configured'] = $this->integrations()->webhookSecret() !== null;
        $raw['notifier_telegram_bot_token_configured'] = $this->integrations()->notifierTelegramBotToken() !== null;
        $raw['oidc_client_secret_configured'] = $this->security()->oidcClientSecret() !== null;
        $raw['deploy_hooks'] = $this->integrations()->deployHooksForEdit();
        $raw['deploy_on_publish'] = $this->integrations()->isDeployOnPublishEnabled();

        return $raw;
    }

    /**
     * Section-scoped edit payload (subset of {@see forEdit()}).
     *
     * @param  list<string>  $keys
     * @return array<string, mixed>
     */
    public function forEditOnly(array $keys): array
    {
        return array_intersect_key($this->forEdit(), array_flip($keys));
    }

    /**
     * Public/safe payload shared on every Inertia page.
     *
     * @return array{
     *     name: string|null,
     *     defaultLanguage: string,
     *     isRegistrationEnabled: bool,
     *     isEmailVerificationRequired: bool,
     *     passwordPolicy: string,
     *     sidebarModules: list<array{id: string, enabled: bool, locked: bool}>,
     *     reportIssueUrl: string|null,
     *     reportBugUrl: string|null,
     *     reportErrorUrl: string|null,
     *     filesMaxUploadBytes: int|null,
     *     chatMaxUploadBytes: int|null
     * }
     */
    public function shared(): array
    {
        $raw = $this->raw();

        return [
            'name' => $this->projectName(),
            'defaultLanguage' => $raw['default_language'],
            'isRegistrationEnabled' => $raw['registration_enabled'],
            'isEmailVerificationRequired' => $raw['email_verification_required'],
            'passwordPolicy' => $raw['password_policy'],
            'sidebarModules' => $raw['sidebar_modules'],
            'reportIssueUrl' => $raw['report_issue_url'],
            'reportBugUrl' => $raw['report_bug_url'],
            'reportErrorUrl' => $raw['report_error_url'],
            'filesMaxUploadBytes' => $raw['files_max_upload_bytes'],
            'chatMaxUploadBytes' => $raw['chat_max_upload_bytes'],
        ];
    }

    public function projectName(): ?string
    {
        return $this->general()->projectName();
    }

    public function displayName(): string
    {
        return $this->general()->displayName();
    }

    public function isSidebarModuleEnabled(string $moduleId): bool
    {
        return $this->general()->isSidebarModuleEnabled($moduleId);
    }

    public function defaultLanguage(): string
    {
        return $this->localization()->defaultLanguage();
    }

    /**
     * @return list<string>
     */
    public function contentLocales(): array
    {
        return $this->localization()->contentLocales();
    }

    public function defaultContentLocale(): string
    {
        return $this->localization()->defaultContentLocale();
    }

    /**
     * @return list<string>
     */
    public function fallbackContentLocales(): array
    {
        return $this->localization()->fallbackContentLocales();
    }

    /**
     * @return list<array{code: string, name: string, flag: string}>
     */
    public function contentLocaleMeta(): array
    {
        return $this->localization()->contentLocaleMeta();
    }

    public function isRegistrationEnabled(): bool
    {
        return $this->security()->isRegistrationEnabled();
    }

    public function isEmailVerificationRequired(): bool
    {
        return $this->security()->isEmailVerificationRequired();
    }

    public function isTwoFactorRequired(): bool
    {
        return $this->security()->isTwoFactorRequired();
    }

    public function defaultUserRole(): ?string
    {
        return $this->security()->defaultUserRole();
    }

    /**
     * @return list<string>
     */
    public function allowedDomains(): array
    {
        return $this->security()->allowedDomains();
    }

    public function loginMaxAttempts(): int
    {
        return $this->security()->loginMaxAttempts();
    }

    public function passwordPolicy(): string
    {
        return $this->security()->passwordPolicy();
    }

    public function passwordRule(): Password
    {
        return $this->security()->passwordRule();
    }

    public function isOidcEnabled(): bool
    {
        return $this->security()->isOidcEnabled();
    }

    public function oidcIssuer(): ?string
    {
        return $this->security()->oidcIssuer();
    }

    public function oidcClientId(): ?string
    {
        return $this->security()->oidcClientId();
    }

    public function oidcButtonLabel(): ?string
    {
        return $this->security()->oidcButtonLabel();
    }

    public function isOidcJitProvisioningEnabled(): bool
    {
        return $this->security()->isOidcJitProvisioningEnabled();
    }

    public function isOidcLoginAvailable(): bool
    {
        return $this->security()->isOidcLoginAvailable();
    }

    public function oidcClientSecret(): ?string
    {
        return $this->security()->oidcClientSecret();
    }

    public static function encryptOidcClientSecret(string $plain): string
    {
        return self::encryptSecret($plain);
    }

    /**
     * @return list<string>
     */
    public function publicApiAllowedOrigins(): array
    {
        return $this->api()->publicApiAllowedOrigins();
    }

    public function forgetPublicApiAllowedOriginsCache(): void
    {
        $this->api()->forgetPublicApiAllowedOriginsCache();
    }

    public function previewUrlDefault(): ?string
    {
        return $this->content()->previewUrlDefault();
    }

    public function revisionRetentionCount(): ?int
    {
        return $this->content()->revisionRetentionCount();
    }

    public function revisionRetentionDays(): ?int
    {
        return $this->content()->revisionRetentionDays();
    }

    /**
     * @return list<string>
     */
    public function allowedTransformations(): array
    {
        return $this->files()->allowedTransformations();
    }

    public function isTransformationsEnabled(): bool
    {
        return $this->files()->isTransformationsEnabled();
    }

    /**
     * @return list<array{
     *     key: string,
     *     fit: string,
     *     width: int|null,
     *     height: int|null,
     *     quality: int,
     *     without_enlargement: bool,
     *     format: string
     * }>
     */
    public function presetTransformations(): array
    {
        return $this->files()->presetTransformations();
    }

    /**
     * @return array{
     *     key: string,
     *     fit: string,
     *     width: int|null,
     *     height: int|null,
     *     quality: int,
     *     without_enlargement: bool,
     *     format: string
     * }|null
     */
    public function transformPreset(string $key): ?array
    {
        return $this->files()->transformPreset($key);
    }

    public function maxTransformSize(): int
    {
        return $this->files()->maxTransformSize();
    }

    public function filesMaxUploadBytes(): ?int
    {
        return $this->files()->filesMaxUploadBytes();
    }

    public function chatMaxUploadBytes(): ?int
    {
        return $this->files()->chatMaxUploadBytes();
    }

    public function uploadAllowSvg(): bool
    {
        return $this->files()->uploadAllowSvg();
    }

    /**
     * @return list<string>|null
     */
    public function uploadAllowedMimes(): ?array
    {
        return $this->files()->uploadAllowedMimes();
    }

    /**
     * @return list<string>|null
     */
    public function uploadAllowedExtensions(): ?array
    {
        return $this->files()->uploadAllowedExtensions();
    }

    public static function encryptWebhookSecret(string $plain): string
    {
        return self::encryptSecret($plain);
    }

    public static function encryptNotifierTelegramBotToken(string $plain): string
    {
        return self::encryptSecret($plain);
    }

    public static function encryptDeployHookUrl(string $plain): string
    {
        return self::encryptSecret($plain);
    }

    /**
     * Compose the normalized bag from each area reader's keys.
     *
     * Keys follow the order of `settings.project.defaults`, which is the order the
     * settings pages have always received; a key no default lists goes last.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    private function normalize(array $raw): array
    {
        $normalized = [
            ...$this->general()->normalize($raw),
            ...$this->localization()->normalize($raw),
            ...$this->security()->normalize($raw),
            ...$this->api()->normalize($raw),
            ...$this->content()->normalize($raw),
            ...$this->files()->normalize($raw),
            ...$this->integrations()->normalize($raw),
        ];

        /** @var array<string, mixed> $defaults */
        $defaults = config('settings.project.defaults', []);

        return array_merge(array_intersect_key($defaults, $normalized), $normalized);
    }
}
