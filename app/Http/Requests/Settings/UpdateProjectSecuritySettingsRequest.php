<?php

namespace App\Http\Requests\Settings;

use App\Http\Requests\Settings\Concerns\AuthorizesProjectSettingsTrait;
use App\Services\Settings\ProjectSettings;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validate authentication & security project settings (policy, registration, OIDC).
 */
class UpdateProjectSecuritySettingsRequest extends FormRequest
{
    use AuthorizesProjectSettingsTrait;

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $policies = config('settings.project.password_policies', ['medium']);
        $guard = config('auth.defaults.guard', 'web');

        return [
            'password_policy' => ['required', 'string', Rule::in($policies)],
            'login_max_attempts' => ['required', 'integer', 'min:1', 'max:100'],
            'registration_enabled' => ['required', 'boolean'],
            'default_user_role' => [
                'nullable',
                'string',
                Rule::exists('roles', 'name')->where(fn ($query) => $query->where('guard_name', $guard)),
            ],
            'email_verification_required' => ['required', 'boolean'],
            'two_factor_required' => ['required', 'boolean'],
            'allowed_domains' => ['nullable', 'array'],
            'allowed_domains.*' => ['string', 'max:255'],
            'oidc_enabled' => ['required', 'boolean'],
            'oidc_issuer' => ['nullable', 'url', 'max:2048'],
            'oidc_client_id' => ['nullable', 'string', 'max:255'],
            'oidc_client_secret' => ['nullable', 'string', 'max:512'],
            'oidc_button_label' => ['nullable', 'string', 'max:64'],
            'oidc_jit_provisioning' => ['required', 'boolean'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function projectValues(): array
    {
        $validated = $this->validated();

        $domains = collect($validated['allowed_domains'] ?? [])
            ->map(fn (string $domain): string => strtolower(trim($domain)))
            ->filter()
            ->unique()
            ->values()
            ->all();

        return [
            'password_policy' => $validated['password_policy'],
            'login_max_attempts' => (int) $validated['login_max_attempts'],
            'registration_enabled' => (bool) $validated['registration_enabled'],
            'default_user_role' => $validated['default_user_role'] ?? null,
            'email_verification_required' => (bool) $validated['email_verification_required'],
            'two_factor_required' => (bool) $validated['two_factor_required'],
            'allowed_domains' => $domains,
            'oidc_enabled' => (bool) $validated['oidc_enabled'],
            'oidc_issuer' => $validated['oidc_issuer'] ?? null,
            'oidc_client_id' => $validated['oidc_client_id'] ?? null,
            'oidc_button_label' => $validated['oidc_button_label'] ?? null,
            'oidc_jit_provisioning' => (bool) $validated['oidc_jit_provisioning'],
            ...$this->oidcClientSecretValue($validated),
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{oidc_client_secret?: string}
     */
    private function oidcClientSecretValue(array $validated): array
    {
        $secret = $validated['oidc_client_secret'] ?? null;
        if (! is_string($secret) || trim($secret) === '') {
            return [];
        }

        return [
            'oidc_client_secret' => ProjectSettings::encryptOidcClientSecret(trim($secret)),
        ];
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        foreach ([
            'default_user_role',
            'oidc_issuer',
            'oidc_client_id',
            'oidc_client_secret',
            'oidc_button_label',
        ] as $field) {
            if ($this->has($field) && $this->input($field) === '') {
                $merge[$field] = null;
            }
        }

        foreach ([
            'registration_enabled',
            'email_verification_required',
            'two_factor_required',
            'oidc_enabled',
            'oidc_jit_provisioning',
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

        if ($merge !== []) {
            $this->merge($merge);
        }
    }
}
