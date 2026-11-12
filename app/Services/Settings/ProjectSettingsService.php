<?php

declare(strict_types=1);

namespace App\Services\Settings;

use App\Data\Deploy\DeployHookData;
use App\Services\Api\PublicApiOriginService;
use App\Services\Collections\ContentLocaleCatalogService;
use App\Services\Settings\Project\ProjectApiSettingsService;
use App\Services\Settings\Project\ProjectContentSettingsService;
use App\Services\Settings\Project\ProjectFilesSettingsService;
use App\Services\Settings\Project\ProjectGeneralSettingsService;
use App\Services\Settings\Project\ProjectIntegrationsSettingsService;
use App\Services\Settings\Project\ProjectLocalizationSettingsService;
use App\Services\Settings\Project\ProjectSecuritySettingsService;
use App\Services\Uploads\ForbiddenUploadExtensionService;
use App\Services\Uploads\UploadAllowlistService;
use App\Services\Uploads\UploadSizeLimiterService;
use App\Services\Webhooks\OutboundWebhookCatalogService;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\Rules\Password;

/**
 * Resolves project-level settings for admin forms and runtime wiring.
 *
 * This class owns the one shared source every area reads from: the memoized,
 * normalized {@see raw()} bag and the {@see decryptSecret()} helper. The area getters
 * live in the per-section readers under `App\Services\Settings\Project` (General,
 * Localization, Security, API, Content, Files, Integrations, matching the settings
 * pages); the getters below are thin delegates kept so existing callers do not change.
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
        $raw['webhook_secret_configured'] = $this->webhookSecret() !== null;
        $raw['notifier_telegram_bot_token_configured'] = $this->notifierTelegramBotToken() !== null;
        $raw['oidc_client_secret_configured'] = $this->oidcClientSecret() !== null;
        $raw['deploy_hooks'] = $this->deployHooksForEdit();
        $raw['deploy_on_publish'] = $this->isDeployOnPublishEnabled();

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

    public function webhookUrl(): ?string
    {
        return $this->integrations()->webhookUrl();
    }

    public function webhookSecret(): ?string
    {
        return $this->integrations()->webhookSecret();
    }

    public static function encryptWebhookSecret(string $plain): string
    {
        return self::encryptSecret($plain);
    }

    public function notifierSlackWebhookUrl(): ?string
    {
        return $this->integrations()->notifierSlackWebhookUrl();
    }

    public function notifierTelegramChatId(): ?string
    {
        return $this->integrations()->notifierTelegramChatId();
    }

    public function isNotifierTelegramConfigured(): bool
    {
        return $this->integrations()->isNotifierTelegramConfigured();
    }

    public function canAllowNotifierEvent(string $type): bool
    {
        return $this->integrations()->canAllowNotifierEvent($type);
    }

    public function notifierTelegramBotToken(): ?string
    {
        return $this->integrations()->notifierTelegramBotToken();
    }

    public static function encryptNotifierTelegramBotToken(string $plain): string
    {
        return self::encryptSecret($plain);
    }

    /**
     * @return list<DeployHookData>
     */
    public function deployHooks(): array
    {
        return $this->integrations()->deployHooks();
    }

    public function deployHookById(string $hookId): ?DeployHookData
    {
        return $this->integrations()->deployHookById($hookId);
    }

    public function isDeployOnPublishEnabled(): bool
    {
        return $this->integrations()->isDeployOnPublishEnabled();
    }

    /**
     * @return list<array{id: string, name: string, url_configured: bool}>
     */
    public function deployHooksForEdit(): array
    {
        return $this->integrations()->deployHooksForEdit();
    }

    public static function encryptDeployHookUrl(string $plain): string
    {
        return self::encryptSecret($plain);
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    private function normalize(array $raw): array
    {
        $locales = array_keys(config('i18n.available_locales', ['en' => 'English']));
        $language = is_string($raw['default_language'] ?? null) ? $raw['default_language'] : 'en';
        if (! in_array($language, $locales, true)) {
            $language = 'en';
        }

        $policy = is_string($raw['password_policy'] ?? null) ? $raw['password_policy'] : 'weak';
        if (! in_array($policy, config('settings.project.password_policies', ['weak']), true)) {
            $policy = 'weak';
        }

        $attempts = is_numeric($raw['login_max_attempts'] ?? null)
            ? (int) $raw['login_max_attempts']
            : 5;

        return [
            'name' => is_string($raw['name'] ?? null) && trim($raw['name']) !== ''
                ? trim($raw['name'])
                : null,
            'description' => is_string($raw['description'] ?? null) ? $raw['description'] : null,
            'url' => is_string($raw['url'] ?? null) && trim($raw['url']) !== ''
                ? trim($raw['url'])
                : null,
            'default_language' => $language,
            ...$this->normalizeContentLocales(
                $raw['content_locales'] ?? null,
                $raw['default_content_locale'] ?? null,
                $raw['fallback_content_locales'] ?? null,
            ),
            'sidebar_modules' => $this->normalizeSidebarModules($raw['sidebar_modules'] ?? null),
            'password_policy' => $policy,
            'login_max_attempts' => max(1, min(100, $attempts)),
            'registration_enabled' => (bool) ($raw['registration_enabled'] ?? false),
            'default_user_role' => is_string($raw['default_user_role'] ?? null) && $raw['default_user_role'] !== ''
                ? $raw['default_user_role']
                : null,
            'email_verification_required' => (bool) ($raw['email_verification_required'] ?? false),
            'two_factor_required' => (bool) ($raw['two_factor_required'] ?? false),
            'allowed_domains' => $this->normalizeDomains($raw['allowed_domains'] ?? []),
            'public_api_allowed_origins' => $this->normalizeOrigins($raw['public_api_allowed_origins'] ?? []),
            'allowed_transformations' => $this->normalizeTransformations($raw['allowed_transformations'] ?? null),
            'preset_transformations' => $this->normalizePresets($raw['preset_transformations'] ?? null),
            'report_issue_url' => $this->nullableUrl($raw['report_issue_url'] ?? null),
            'report_bug_url' => $this->nullableUrl($raw['report_bug_url'] ?? null),
            'report_error_url' => $this->nullableUrl($raw['report_error_url'] ?? null),
            'webhook_url' => $this->nullableUrl($raw['webhook_url'] ?? null),
            // Encrypted ciphertext (or null) — decrypt only via webhookSecret()
            'webhook_secret' => is_string($raw['webhook_secret'] ?? null) && $raw['webhook_secret'] !== ''
                ? $raw['webhook_secret']
                : null,
            'notifier_slack_webhook_url' => $this->nullableUrl($raw['notifier_slack_webhook_url'] ?? null),
            'notifier_telegram_bot_token' => is_string($raw['notifier_telegram_bot_token'] ?? null)
                && $raw['notifier_telegram_bot_token'] !== ''
                ? $raw['notifier_telegram_bot_token']
                : null,
            'notifier_telegram_chat_id' => is_string($raw['notifier_telegram_chat_id'] ?? null)
                && trim($raw['notifier_telegram_chat_id']) !== ''
                ? trim($raw['notifier_telegram_chat_id'])
                : null,
            'notifier_event_types' => $this->normalizeNotifierEventTypes($raw['notifier_event_types'] ?? null),
            'deploy_hooks' => $this->normalizeDeployHooks($raw['deploy_hooks'] ?? null),
            'deploy_on_publish' => (bool) ($raw['deploy_on_publish'] ?? false),
            'oidc_enabled' => (bool) ($raw['oidc_enabled'] ?? false),
            'oidc_issuer' => $this->nullableUrl($raw['oidc_issuer'] ?? null),
            'oidc_client_id' => is_string($raw['oidc_client_id'] ?? null) && trim($raw['oidc_client_id']) !== ''
                ? trim($raw['oidc_client_id'])
                : null,
            'oidc_client_secret' => is_string($raw['oidc_client_secret'] ?? null)
                && $raw['oidc_client_secret'] !== ''
                ? $raw['oidc_client_secret']
                : null,
            'oidc_button_label' => is_string($raw['oidc_button_label'] ?? null) && trim($raw['oidc_button_label']) !== ''
                ? trim($raw['oidc_button_label'])
                : null,
            'oidc_jit_provisioning' => (bool) ($raw['oidc_jit_provisioning'] ?? false),
            'preview_url_default' => $this->nullablePreviewTemplate($raw['preview_url_default'] ?? null),
            'revision_retention_count' => $this->nullablePositiveInt(
                $raw['revision_retention_count'] ?? null,
                1,
                10000,
            ),
            'revision_retention_days' => $this->nullablePositiveInt(
                $raw['revision_retention_days'] ?? null,
                1,
                3650,
            ),
            'files_max_upload_bytes' => $this->nullablePositiveInt(
                $raw['files_max_upload_bytes'] ?? null,
                1,
                UploadSizeLimiterService::SETTING_MAX_BYTES,
            ),
            'chat_max_upload_bytes' => $this->nullablePositiveInt(
                $raw['chat_max_upload_bytes'] ?? null,
                1,
                UploadSizeLimiterService::SETTING_MAX_BYTES,
            ),
            'upload_allowed_mimes' => $this->normalizeUploadMimeList($raw['upload_allowed_mimes'] ?? null),
            'upload_allowed_extensions' => $this->normalizeUploadExtensionList(
                $raw['upload_allowed_extensions'] ?? null,
            ),
            'upload_allow_svg' => (bool) ($raw['upload_allow_svg'] ?? false),
        ];
    }

    /**
     * @return list<string>|null
     */
    private function normalizeUploadMimeList(mixed $value): ?array
    {
        if ($value === null || $value === '' || $value === []) {
            return null;
        }

        if (! is_array($value)) {
            return null;
        }

        $mimes = array_values(array_unique(array_filter(array_map(
            static fn (mixed $mime): string => strtolower(trim((string) $mime)),
            $value,
        ), static fn (string $mime): bool => $mime !== '' && str_contains($mime, '/'))));

        return $mimes === [] ? null : $mimes;
    }

    /**
     * @return list<string>|null
     */
    private function normalizeUploadExtensionList(mixed $value): ?array
    {
        if ($value === null || $value === '' || $value === []) {
            return null;
        }

        if (! is_array($value)) {
            return null;
        }

        $extensions = array_values(array_unique(array_filter(array_map(
            static function (mixed $ext): string {
                $normalized = strtolower(trim((string) $ext));
                $normalized = ltrim($normalized, '.');

                return preg_replace('/[^a-z0-9]/', '', $normalized) ?? '';
            },
            $value,
        ), static fn (string $ext): bool => $ext !== '')));

        // Hard floor extensions can never be allowlisted via settings.
        $extensions = array_values(array_filter(
            $extensions,
            static fn (string $ext): bool => ! ForbiddenUploadExtensionService::isHardFloor("file.{$ext}")
                || in_array($ext, UploadAllowlistService::SVG_EXTENSIONS, true),
        ));

        return $extensions === [] ? null : $extensions;
    }

    /**
     * @return list<string>
     */
    private function normalizeNotifierEventTypes(mixed $value): array
    {
        $allowed = OutboundWebhookCatalogService::notifierSelectableTypes();

        if ($value === null) {
            return $allowed;
        }

        if (! is_array($value)) {
            return $allowed;
        }

        $selected = [];
        foreach ($value as $type) {
            if (! is_string($type) || $type === '' || isset($selected[$type])) {
                continue;
            }
            if (! in_array($type, $allowed, true)) {
                continue;
            }
            $selected[$type] = $type;
        }

        return array_values($selected);
    }

    /**
     * Stored deploy hooks (ciphertext URLs). Max 10 named hooks.
     *
     * @return list<array{id: string, name: string, url: string}>
     */
    private function normalizeDeployHooks(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $hooks = [];

        foreach ($value as $row) {
            if (! is_array($row) || count($hooks) >= 10) {
                break;
            }

            $id = is_string($row['id'] ?? null) ? trim($row['id']) : '';
            $name = is_string($row['name'] ?? null) ? trim($row['name']) : '';
            $url = is_string($row['url'] ?? null) ? $row['url'] : '';

            if ($id === '' || $name === '' || $url === '') {
                continue;
            }

            if (strlen($name) > 120) {
                $name = substr($name, 0, 120);
            }

            $hooks[] = [
                'id' => $id,
                'name' => $name,
                'url' => $url,
            ];
        }

        return $hooks;
    }

    /**
     * @return array{
     *     content_locales: list<string>,
     *     default_content_locale: string,
     *     fallback_content_locales: list<string>
     * }
     */
    private function normalizeContentLocales(
        mixed $locales,
        mixed $default,
        mixed $fallbacks,
    ): array {
        $seedLocales = $this->configLocaleList('collections.locales', ['en', 'it']);
        $seedFallbacks = $this->configLocaleList('collections.fallback_locales', $seedLocales);

        $normalized = [];
        if (is_array($locales)) {
            foreach ($locales as $locale) {
                if (! is_string($locale)) {
                    continue;
                }
                $code = trim($locale);
                if ($code === '' || isset($normalized[$code])) {
                    continue;
                }
                // Allow catalog codes and any already-seeded/config codes
                if (! ContentLocaleCatalogService::isKnown($code) && ! in_array($code, $seedLocales, true)) {
                    continue;
                }
                $normalized[$code] = $code;
            }
        }

        $contentLocales = array_values($normalized);
        if ($contentLocales === []) {
            $contentLocales = $seedLocales !== [] ? $seedLocales : ['en'];
        }

        $defaultLocale = is_string($default) && trim($default) !== '' ? trim($default) : null;
        if ($defaultLocale === null || ! in_array($defaultLocale, $contentLocales, true)) {
            $defaultLocale = $contentLocales[0];
        }

        $fallbackList = [];
        if (is_array($fallbacks)) {
            foreach ($fallbacks as $locale) {
                if (! is_string($locale)) {
                    continue;
                }
                $code = trim($locale);
                if ($code === '' || ! in_array($code, $contentLocales, true) || in_array($code, $fallbackList, true)) {
                    continue;
                }
                $fallbackList[] = $code;
            }
        }

        if ($fallbackList === []) {
            // default + remaining content locales in order (seed fallbacks preferred when matching)
            $fallbackList = [$defaultLocale];
            foreach ($seedFallbacks as $locale) {
                if (in_array($locale, $contentLocales, true) && ! in_array($locale, $fallbackList, true)) {
                    $fallbackList[] = $locale;
                }
            }
            foreach ($contentLocales as $locale) {
                if (! in_array($locale, $fallbackList, true)) {
                    $fallbackList[] = $locale;
                }
            }
        }

        return [
            'content_locales' => $contentLocales,
            'default_content_locale' => $defaultLocale,
            'fallback_content_locales' => $fallbackList,
        ];
    }

    /**
     * @param  list<string>  $fallback
     * @return list<string>
     */
    private function configLocaleList(string $key, array $fallback): array
    {
        $locales = config($key, $fallback);

        if (! is_array($locales)) {
            return $fallback;
        }

        return array_values(array_filter($locales, fn (mixed $locale): bool => is_string($locale) && $locale !== ''));
    }

    /**
     * @return list<array{id: string, enabled: bool, locked: bool}>
     */
    private function normalizeSidebarModules(mixed $value): array
    {
        /** @var list<array{id: string, enabled: bool, locked: bool}> $defaults */
        $defaults = config('settings.project.defaults.sidebar_modules', []);
        $known = config('settings.project.sidebar_module_ids', []);
        $lockedIds = collect($defaults)->where('locked', true)->pluck('id')->all();

        $byId = [];
        if (is_array($value)) {
            foreach ($value as $entry) {
                if (! is_array($entry) || ! is_string($entry['id'] ?? null)) {
                    continue;
                }
                if (! in_array($entry['id'], $known, true)) {
                    continue;
                }
                $byId[$entry['id']] = [
                    'id' => $entry['id'],
                    'enabled' => (bool) ($entry['enabled'] ?? true),
                    'locked' => in_array($entry['id'], $lockedIds, true),
                ];
            }
        }

        $ordered = [];
        foreach ($value ?? [] as $entry) {
            if (! is_array($entry) || ! isset($byId[$entry['id'] ?? ''])) {
                continue;
            }
            $ordered[] = $byId[$entry['id']];
            unset($byId[$entry['id']]);
        }

        foreach ($defaults as $default) {
            if (! isset($byId[$default['id']]) && ! collect($ordered)->contains('id', $default['id'])) {
                $ordered[] = [
                    'id' => $default['id'],
                    'enabled' => (bool) $default['enabled'],
                    'locked' => (bool) $default['locked'],
                ];
            } elseif (isset($byId[$default['id']])) {
                $ordered[] = $byId[$default['id']];
                unset($byId[$default['id']]);
            }
        }

        foreach ($byId as $remaining) {
            $ordered[] = $remaining;
        }

        $normalized = array_values(array_map(function (array $module) use ($lockedIds): array {
            if (in_array($module['id'], $lockedIds, true)) {
                $module['enabled'] = true;
                $module['locked'] = true;
            }

            return $module;
        }, $ordered));

        return $this->pinSidebarModules($normalized);
    }

    /**
     * Force pinned modules (e.g. AI) to the front; other order is preserved.
     *
     * @param  list<array{id: string, enabled: bool, locked: bool}>  $modules
     * @return list<array{id: string, enabled: bool, locked: bool}>
     */
    private function pinSidebarModules(array $modules): array
    {
        /** @var list<string> $pinnedIds */
        $pinnedIds = config('settings.project.sidebar_pinned_module_ids', []);
        if ($pinnedIds === []) {
            return $modules;
        }

        $byId = [];
        foreach ($modules as $module) {
            $byId[$module['id']] = $module;
        }

        $pinned = [];
        foreach ($pinnedIds as $id) {
            if (isset($byId[$id])) {
                $pinned[] = $byId[$id];
                unset($byId[$id]);
            }
        }

        $rest = [];
        foreach ($modules as $module) {
            if (isset($byId[$module['id']])) {
                $rest[] = $module;
            }
        }

        return array_values([...$pinned, ...$rest]);
    }

    /**
     * @return list<string>
     */
    private function normalizeDomains(mixed $value): array
    {
        if (is_string($value)) {
            $value = preg_split('/[\s,]+/', $value) ?: [];
        }

        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->map(fn (mixed $domain): string => strtolower(trim((string) $domain)))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @return list<string>
     */
    private function normalizeOrigins(mixed $value): array
    {
        if (is_string($value)) {
            $value = preg_split('/[\s,]+/', $value) ?: [];
        }

        if (! is_array($value)) {
            return [];
        }

        $normalized = [];
        foreach ($value as $entry) {
            if (! is_string($entry)) {
                continue;
            }
            $origin = PublicApiOriginService::normalize($entry);
            if ($origin === null || in_array($origin, $normalized, true)) {
                continue;
            }
            $normalized[] = $origin;
        }

        return $normalized;
    }

    /**
     * @return list<string>
     */
    private function normalizeTransformations(mixed $value): array
    {
        $allowed = config('settings.project.allowed_transformations', ['thumbnail']);

        if (! is_array($value)) {
            return $allowed;
        }

        return collect($value)
            ->map(fn (mixed $item): string => (string) $item)
            ->filter(fn (string $item): bool => in_array($item, $allowed, true))
            ->unique()
            ->values()
            ->all();
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
    private function normalizePresets(mixed $value): array
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded)
                ? $decoded
                : (preg_split('/[\s,]+/', $value) ?: []);
        }

        if (! is_array($value) || $value === []) {
            /** @var list<array<string, mixed>> $defaults */
            $defaults = config('settings.project.defaults.preset_transformations', []);
            $value = $defaults;
        }

        $fits = config('settings.project.transform_fits', ['contain']);
        $formats = config('settings.project.transform_formats', ['auto']);
        $normalized = [];
        $seenKeys = [];

        foreach ($value as $entry) {
            // Legacy bare sizes → square contain presets
            if (is_numeric($entry)) {
                $size = (int) $entry;
                if ($size < 16 || $size > 4096) {
                    continue;
                }
                $entry = [
                    'key' => 'size-'.$size,
                    'fit' => 'contain',
                    'width' => $size,
                    'height' => $size,
                    'quality' => 82,
                    'without_enlargement' => true,
                    'format' => 'auto',
                ];
            }

            if (! is_array($entry)) {
                continue;
            }

            $key = is_string($entry['key'] ?? null)
                ? strtolower(trim($entry['key']))
                : '';
            if ($key === '' || ! preg_match('/^[a-z0-9_-]+$/', $key) || isset($seenKeys[$key])) {
                continue;
            }

            $fit = is_string($entry['fit'] ?? null) ? $entry['fit'] : 'contain';
            if (! in_array($fit, $fits, true)) {
                $fit = 'contain';
            }

            $format = is_string($entry['format'] ?? null) ? $entry['format'] : 'auto';
            if (! in_array($format, $formats, true)) {
                $format = 'auto';
            }

            $width = isset($entry['width']) && $entry['width'] !== '' && $entry['width'] !== null
                ? (int) $entry['width']
                : null;
            $height = isset($entry['height']) && $entry['height'] !== '' && $entry['height'] !== null
                ? (int) $entry['height']
                : null;

            if ($width !== null && ($width < 1 || $width > 4096)) {
                $width = null;
            }
            if ($height !== null && ($height < 1 || $height > 4096)) {
                $height = null;
            }
            if ($width === null && $height === null) {
                continue;
            }

            $quality = is_numeric($entry['quality'] ?? null) ? (int) $entry['quality'] : 82;
            $quality = max(1, min(100, $quality));

            $seenKeys[$key] = true;
            $normalized[] = [
                'key' => $key,
                'fit' => $fit,
                'width' => $width,
                'height' => $height,
                'quality' => $quality,
                'without_enlargement' => (bool) ($entry['without_enlargement'] ?? true),
                'format' => $format,
            ];
        }

        if ($normalized !== []) {
            return $normalized;
        }

        // Hard fallback if config defaults are empty/invalid
        return [[
            'key' => 'thumbnail',
            'fit' => 'contain',
            'width' => 128,
            'height' => 128,
            'quality' => 82,
            'without_enlargement' => true,
            'format' => 'auto',
        ]];
    }

    private function nullableUrl(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return trim($value);
    }

    /**
     * HTTP(S) URL template that may contain `{{token}}` placeholders.
     */
    private function nullablePreviewTemplate(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        $trimmed = trim($value);
        if (! preg_match('/^https?:\/\/.+/i', $trimmed)) {
            return null;
        }

        return $trimmed;
    }

    private function nullablePositiveInt(mixed $value, int $min, int $max): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (! is_numeric($value)) {
            return null;
        }

        $int = (int) $value;

        if ($int < $min || $int > $max) {
            return null;
        }

        return $int;
    }
}
