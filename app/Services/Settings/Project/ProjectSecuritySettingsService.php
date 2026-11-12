<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Settings\ProjectSettingsService;
use Illuminate\Validation\Rules\Password;

/**
 * Reads the Authentication & Security project settings: password policy, login
 * throttling, registration, required 2FA and the OIDC single sign-on client.
 *
 * Every value comes from the shared, memoized {@see ProjectSettingsService::raw()};
 * the OIDC client secret goes through {@see ProjectSettingsService::storedSecret()}.
 */
class ProjectSecuritySettingsService
{
    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    public function isRegistrationEnabled(): bool
    {
        return (bool) $this->projectSettings->raw()['registration_enabled'];
    }

    public function isEmailVerificationRequired(): bool
    {
        return (bool) $this->projectSettings->raw()['email_verification_required'];
    }

    public function isTwoFactorRequired(): bool
    {
        return (bool) $this->projectSettings->raw()['two_factor_required'];
    }

    public function defaultUserRole(): ?string
    {
        $role = $this->projectSettings->raw()['default_user_role'] ?? null;

        return is_string($role) && $role !== '' ? $role : null;
    }

    /**
     * @return list<string>
     */
    public function allowedDomains(): array
    {
        return $this->projectSettings->raw()['allowed_domains'];
    }

    public function loginMaxAttempts(): int
    {
        return max(1, (int) $this->projectSettings->raw()['login_max_attempts']);
    }

    public function passwordPolicy(): string
    {
        return $this->projectSettings->raw()['password_policy'];
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

    public function isOidcEnabled(): bool
    {
        return (bool) $this->projectSettings->raw()['oidc_enabled'];
    }

    public function oidcIssuer(): ?string
    {
        $issuer = $this->projectSettings->raw()['oidc_issuer'];

        return is_string($issuer) && $issuer !== '' ? $issuer : null;
    }

    public function oidcClientId(): ?string
    {
        $id = $this->projectSettings->raw()['oidc_client_id'];

        return is_string($id) && $id !== '' ? $id : null;
    }

    public function oidcButtonLabel(): ?string
    {
        $label = $this->projectSettings->raw()['oidc_button_label'];

        return is_string($label) && trim($label) !== '' ? trim($label) : null;
    }

    public function isOidcJitProvisioningEnabled(): bool
    {
        return (bool) $this->projectSettings->raw()['oidc_jit_provisioning'];
    }

    /**
     * True when OIDC is enabled and credentials are present (login CTA).
     */
    public function isOidcLoginAvailable(): bool
    {
        return $this->isOidcEnabled()
            && $this->oidcIssuer() !== null
            && $this->oidcClientId() !== null
            && $this->oidcClientSecret() !== null;
    }

    /**
     * Decrypted OIDC client secret, or null when unset/unreadable.
     */
    public function oidcClientSecret(): ?string
    {
        return $this->projectSettings->storedSecret('oidc_client_secret');
    }
}
