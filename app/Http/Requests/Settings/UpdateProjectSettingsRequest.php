<?php

namespace App\Http\Requests\Settings;

use App\Enums\PermissionEnum;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Settings\ProjectSettings;
use App\Support\Collections\ContentLocaleCatalog;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate project settings updates.
 */
class UpdateProjectSettingsRequest extends FormRequest
{
    /**
     * Authorize users who can manage project settings.
     */
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null
            && app(EffectivePermissionResolver::class)
                ->hasPermission($user, PermissionEnum::CanManageProjectSettings->value);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $locales = array_keys(config('i18n.available_locales', ['en' => 'English']));
        $contentCatalog = ContentLocaleCatalog::codes();
        $moduleIds = config('settings.project.sidebar_module_ids', []);
        $policies = config('settings.project.password_policies', ['medium']);
        $transformations = config('settings.project.allowed_transformations', ['thumbnail']);
        $fits = config('settings.project.transform_fits', ['contain']);
        $formats = config('settings.project.transform_formats', ['auto']);
        $guard = config('auth.defaults.guard', 'web');

        return [
            'name' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'url' => ['nullable', 'url', 'max:2048'],
            'default_language' => ['required', 'string', Rule::in($locales)],
            'content_locales' => ['required', 'array', 'min:1'],
            'content_locales.*' => ['required', 'string', 'distinct', Rule::in($contentCatalog)],
            'default_content_locale' => ['required', 'string'],
            'fallback_content_locales' => ['nullable', 'array'],
            'fallback_content_locales.*' => ['string'],
            'sidebar_modules' => ['required', 'array', 'min:1'],
            'sidebar_modules.*.id' => ['required', 'string', Rule::in($moduleIds)],
            'sidebar_modules.*.enabled' => ['required', 'boolean'],
            'sidebar_modules.*.locked' => ['sometimes', 'boolean'],
            'password_policy' => ['required', 'string', Rule::in($policies)],
            'login_max_attempts' => ['required', 'integer', 'min:1', 'max:100'],
            'registration_enabled' => ['required', 'boolean'],
            'default_user_role' => [
                'nullable',
                'string',
                Rule::exists('roles', 'name')->where(fn ($query) => $query->where('guard_name', $guard)),
            ],
            'email_verification_required' => ['required', 'boolean'],
            'allowed_domains' => ['nullable', 'array'],
            'allowed_domains.*' => ['string', 'max:255'],
            'allowed_transformations' => ['nullable', 'array'],
            'allowed_transformations.*' => ['string', Rule::in($transformations)],
            'preset_transformations' => ['required', 'array', 'min:1'],
            'preset_transformations.*.key' => ['required', 'string', 'max:64', 'distinct', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'preset_transformations.*.fit' => ['required', 'string', Rule::in($fits)],
            'preset_transformations.*.width' => ['nullable', 'integer', 'min:1', 'max:4096'],
            'preset_transformations.*.height' => ['nullable', 'integer', 'min:1', 'max:4096'],
            'preset_transformations.*.quality' => ['required', 'integer', 'min:1', 'max:100'],
            'preset_transformations.*.without_enlargement' => ['required', 'boolean'],
            'preset_transformations.*.format' => ['required', 'string', Rule::in($formats)],
            'report_issue_url' => ['nullable', 'url', 'max:2048'],
            'report_bug_url' => ['nullable', 'url', 'max:2048'],
            'report_error_url' => ['nullable', 'url', 'max:2048'],
            'webhook_url' => ['nullable', 'url', 'max:2048'],
            // Empty = keep existing secret; never required on every save
            'webhook_secret' => ['nullable', 'string', 'max:512'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $contentLocales = $this->input('content_locales', []);
            if (is_array($contentLocales)) {
                $default = $this->input('default_content_locale');
                if (is_string($default) && $default !== '' && ! in_array($default, $contentLocales, true)) {
                    $validator->errors()->add(
                        'default_content_locale',
                        'The default content locale must be one of the selected content locales.',
                    );
                }

                $fallbacks = $this->input('fallback_content_locales', []);
                if (is_array($fallbacks)) {
                    foreach ($fallbacks as $index => $locale) {
                        if (is_string($locale) && $locale !== '' && ! in_array($locale, $contentLocales, true)) {
                            $validator->errors()->add(
                                "fallback_content_locales.{$index}",
                                'Fallback locales must be selected content locales.',
                            );
                        }
                    }
                }
            }

            foreach ($this->input('preset_transformations', []) as $index => $preset) {
                if (! is_array($preset)) {
                    continue;
                }

                $width = $preset['width'] ?? null;
                $height = $preset['height'] ?? null;

                if (($width === null || $width === '') && ($height === null || $height === '')) {
                    $validator->errors()->add(
                        "preset_transformations.{$index}.width",
                        'At least one of width or height is required.',
                    );
                }
            }
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function projectValues(): array
    {
        $validated = $this->validated();
        $defaults = config('settings.project.defaults.sidebar_modules', []);
        $lockedIds = collect($defaults)->where('locked', true)->pluck('id')->all();

        $modules = collect($validated['sidebar_modules'])
            ->map(function (array $module) use ($lockedIds): array {
                $locked = in_array($module['id'], $lockedIds, true);

                return [
                    'id' => $module['id'],
                    'enabled' => $locked ? true : (bool) $module['enabled'],
                    'locked' => $locked,
                ];
            })
            ->values()
            ->all();

        $modules = $this->pinSidebarModules($modules);

        $domains = collect($validated['allowed_domains'] ?? [])
            ->map(fn (string $domain): string => strtolower(trim($domain)))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $presets = collect($validated['preset_transformations'])
            ->map(function (array $preset): array {
                return [
                    'key' => strtolower(trim($preset['key'])),
                    'fit' => $preset['fit'],
                    'width' => isset($preset['width']) ? (int) $preset['width'] : null,
                    'height' => isset($preset['height']) ? (int) $preset['height'] : null,
                    'quality' => (int) $preset['quality'],
                    'without_enlargement' => (bool) $preset['without_enlargement'],
                    'format' => $preset['format'],
                ];
            })
            ->values()
            ->all();

        return [
            'name' => $validated['name'] ?? null,
            'description' => $validated['description'] ?? null,
            'url' => $validated['url'] ?? null,
            'default_language' => $validated['default_language'],
            'content_locales' => array_values($validated['content_locales']),
            'default_content_locale' => $validated['default_content_locale'],
            'fallback_content_locales' => array_values($validated['fallback_content_locales'] ?? []),
            'sidebar_modules' => $modules,
            'password_policy' => $validated['password_policy'],
            'login_max_attempts' => (int) $validated['login_max_attempts'],
            'registration_enabled' => (bool) $validated['registration_enabled'],
            'default_user_role' => $validated['default_user_role'] ?? null,
            'email_verification_required' => (bool) $validated['email_verification_required'],
            'allowed_domains' => $domains,
            'allowed_transformations' => array_values($validated['allowed_transformations'] ?? []),
            'preset_transformations' => $presets,
            'report_issue_url' => $validated['report_issue_url'] ?? null,
            'report_bug_url' => $validated['report_bug_url'] ?? null,
            'report_error_url' => $validated['report_error_url'] ?? null,
            'webhook_url' => $validated['webhook_url'] ?? null,
            ...$this->webhookSecretValue($validated),
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{webhook_secret?: string}
     */
    private function webhookSecretValue(array $validated): array
    {
        $secret = $validated['webhook_secret'] ?? null;
        if (! is_string($secret) || trim($secret) === '') {
            return [];
        }

        return [
            'webhook_secret' => ProjectSettings::encryptWebhookSecret(trim($secret)),
        ];
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        foreach ([
            'name',
            'description',
            'url',
            'default_user_role',
            'report_issue_url',
            'report_bug_url',
            'report_error_url',
            'webhook_url',
            'webhook_secret',
        ] as $field) {
            if ($this->has($field) && $this->input($field) === '') {
                $merge[$field] = null;
            }
        }

        foreach ([
            'registration_enabled',
            'email_verification_required',
        ] as $boolField) {
            if ($this->has($boolField)) {
                $merge[$boolField] = filter_var($this->input($boolField), FILTER_VALIDATE_BOOLEAN);
            }
        }

        if ($this->has('allowed_domains') && is_string($this->input('allowed_domains'))) {
            $merge['allowed_domains'] = collect(preg_split('/[\s,]+/', (string) $this->input('allowed_domains')) ?: [])
                ->map(fn (string $domain): string => trim($domain))
                ->filter()
                ->values()
                ->all();
        }

        if ($this->has('preset_transformations') && is_string($this->input('preset_transformations'))) {
            $decoded = json_decode((string) $this->input('preset_transformations'), true);
            if (is_array($decoded)) {
                $merge['preset_transformations'] = collect($decoded)
                    ->map(function (mixed $entry): mixed {
                        if (! is_array($entry)) {
                            return $entry;
                        }

                        if (array_key_exists('without_enlargement', $entry)) {
                            $entry['without_enlargement'] = filter_var(
                                $entry['without_enlargement'],
                                FILTER_VALIDATE_BOOLEAN,
                            );
                        }

                        foreach (['width', 'height'] as $dim) {
                            if (array_key_exists($dim, $entry) && ($entry[$dim] === '' || $entry[$dim] === null)) {
                                $entry[$dim] = null;
                            }
                        }

                        return $entry;
                    })
                    ->all();
            }
        }

        if ($this->has('sidebar_modules') && is_string($this->input('sidebar_modules'))) {
            $decoded = json_decode((string) $this->input('sidebar_modules'), true);
            if (is_array($decoded)) {
                $merge['sidebar_modules'] = $decoded;
            }
        }

        if ($this->has('allowed_transformations') && is_string($this->input('allowed_transformations'))) {
            $decoded = json_decode((string) $this->input('allowed_transformations'), true);
            if (is_array($decoded)) {
                $merge['allowed_transformations'] = $decoded;
            }
        }

        if ($this->has('content_locales') && is_string($this->input('content_locales'))) {
            $decoded = json_decode((string) $this->input('content_locales'), true);
            if (is_array($decoded)) {
                $merge['content_locales'] = $decoded;
            }
        }

        if ($this->has('fallback_content_locales') && is_string($this->input('fallback_content_locales'))) {
            $decoded = json_decode((string) $this->input('fallback_content_locales'), true);
            if (is_array($decoded)) {
                $merge['fallback_content_locales'] = $decoded;
            }
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }

    /**
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
}
