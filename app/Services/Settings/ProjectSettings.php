<?php

namespace App\Services\Settings;

use Illuminate\Validation\Rules\Password;

/**
 * Resolves project-level settings for admin forms and runtime wiring.
 */
class ProjectSettings
{
    public function __construct(
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Raw project settings bag merged with defaults.
     *
     * @return array<string, mixed>
     */
    public function raw(): array
    {
        $raw = $this->settings->project(
            'project',
            config('settings.project.defaults', []),
        );

        return $this->normalize($raw);
    }

    /**
     * Edit-form payload.
     *
     * @return array<string, mixed>
     */
    public function forEdit(): array
    {
        return $this->raw();
    }

    /**
     * Public/safe payload shared on every Inertia page.
     *
     * @return array{
     *     name: string|null,
     *     defaultLanguage: string,
     *     registrationEnabled: bool,
     *     emailVerificationRequired: bool,
     *     sidebarModules: list<array{id: string, enabled: bool, locked: bool}>,
     *     reportIssueUrl: string|null,
     *     reportBugUrl: string|null,
     *     reportErrorUrl: string|null
     * }
     */
    public function shared(): array
    {
        $raw = $this->raw();

        return [
            'name' => $this->projectName(),
            'defaultLanguage' => $raw['default_language'],
            'registrationEnabled' => $raw['registration_enabled'],
            'emailVerificationRequired' => $raw['email_verification_required'],
            'sidebarModules' => $raw['sidebar_modules'],
            'reportIssueUrl' => $raw['report_issue_url'],
            'reportBugUrl' => $raw['report_bug_url'],
            'reportErrorUrl' => $raw['report_error_url'],
        ];
    }

    public function projectName(): ?string
    {
        $name = $this->raw()['name'] ?? null;

        return is_string($name) && trim($name) !== '' ? trim($name) : null;
    }

    public function displayName(): string
    {
        return $this->projectName() ?? (string) config('app.name');
    }

    public function defaultLanguage(): string
    {
        return $this->raw()['default_language'];
    }

    public function registrationEnabled(): bool
    {
        return (bool) $this->raw()['registration_enabled'];
    }

    public function emailVerificationRequired(): bool
    {
        return (bool) $this->raw()['email_verification_required'];
    }

    public function defaultUserRole(): ?string
    {
        $role = $this->raw()['default_user_role'] ?? null;

        return is_string($role) && $role !== '' ? $role : null;
    }

    /**
     * @return list<string>
     */
    public function allowedDomains(): array
    {
        return $this->raw()['allowed_domains'];
    }

    public function loginMaxAttempts(): int
    {
        return max(1, (int) $this->raw()['login_max_attempts']);
    }

    public function passwordPolicy(): string
    {
        return $this->raw()['password_policy'];
    }

    /**
     * Password rule driven by project password_policy.
     */
    public function passwordRule(): Password
    {
        return match ($this->passwordPolicy()) {
            'weak' => Password::min(6),
            'strong' => Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised(),
            default => Password::min(8)->mixedCase()->numbers(),
        };
    }

    /**
     * @return list<string>
     */
    public function allowedTransformations(): array
    {
        return $this->raw()['allowed_transformations'];
    }

    public function transformationsEnabled(): bool
    {
        return in_array('thumbnail', $this->allowedTransformations(), true);
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
        return $this->raw()['preset_transformations'];
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
        foreach ($this->presetTransformations() as $preset) {
            if ($preset['key'] === $key) {
                return $preset;
            }
        }

        return null;
    }

    public function maxTransformSize(): int
    {
        $presets = $this->presetTransformations();
        $edges = [];

        foreach ($presets as $preset) {
            if (is_int($preset['width'])) {
                $edges[] = $preset['width'];
            }
            if (is_int($preset['height'])) {
                $edges[] = $preset['height'];
            }
        }

        return $edges === [] ? 256 : max($edges);
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
            'sidebar_modules' => $this->normalizeSidebarModules($raw['sidebar_modules'] ?? null),
            'password_policy' => $policy,
            'login_max_attempts' => max(1, min(100, $attempts)),
            'registration_enabled' => (bool) ($raw['registration_enabled'] ?? true),
            'default_user_role' => is_string($raw['default_user_role'] ?? null) && $raw['default_user_role'] !== ''
                ? $raw['default_user_role']
                : null,
            'email_verification_required' => (bool) ($raw['email_verification_required'] ?? false),
            'allowed_domains' => $this->normalizeDomains($raw['allowed_domains'] ?? []),
            'allowed_transformations' => $this->normalizeTransformations($raw['allowed_transformations'] ?? null),
            'preset_transformations' => $this->normalizePresets($raw['preset_transformations'] ?? null),
            'report_issue_url' => $this->nullableUrl($raw['report_issue_url'] ?? null),
            'report_bug_url' => $this->nullableUrl($raw['report_bug_url'] ?? null),
            'report_error_url' => $this->nullableUrl($raw['report_error_url'] ?? null),
        ];
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
}
