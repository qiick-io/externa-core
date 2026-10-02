<?php

namespace App\Services\Auth;

use App\Models\Role;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Contracts\User as SocialiteUser;

/**
 * Links or (optionally) JIT-provisions local users from an OIDC identity.
 */
class OidcUserResolver
{
    public function __construct(
        private readonly ProjectSettings $project,
    ) {}

    public function resolve(SocialiteUser $socialiteUser): User
    {
        $sub = trim((string) $socialiteUser->getId());
        $email = strtolower(trim((string) $socialiteUser->getEmail()));
        $raw = method_exists($socialiteUser, 'getRaw')
            ? $socialiteUser->getRaw()
            : (is_array($socialiteUser->user ?? null) ? $socialiteUser->user : []);

        if ($sub === '') {
            throw ValidationException::withMessages([
                'email' => __('SSO login failed: missing subject claim.'),
            ]);
        }

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages([
                'email' => __('SSO login failed: missing email claim.'),
            ]);
        }

        if (! $this->emailVerified($raw)) {
            throw ValidationException::withMessages([
                'email' => __('SSO login requires a verified email from the identity provider.'),
            ]);
        }

        $bySub = User::query()->where('oidc_sub', $sub)->first();
        if ($bySub !== null) {
            return $this->assertActive($bySub);
        }

        $byEmail = User::query()->where('email', $email)->first();
        if ($byEmail !== null) {
            $user = $this->assertActive($byEmail);
            if ($user->oidc_sub === null || $user->oidc_sub === '') {
                $user->forceFill(['oidc_sub' => $sub])->save();
            } elseif ($user->oidc_sub !== $sub) {
                throw ValidationException::withMessages([
                    'email' => __('This account is already linked to a different SSO identity.'),
                ]);
            }

            return $user;
        }

        if (! $this->project->oidcJitProvisioning()) {
            throw ValidationException::withMessages([
                'email' => __('No local account matches this SSO email. Ask an admin to create your user first.'),
            ]);
        }

        $this->assertAllowedDomain($email);

        $name = trim((string) ($socialiteUser->getName() ?: ''));
        [$first, $last] = $this->splitName($name, $email);

        $user = User::query()->create([
            'first_name' => $first,
            'last_name' => $last,
            'email' => $email,
            'password' => null,
            'oidc_sub' => $sub,
            'is_active' => true,
        ]);

        $user->forceFill(['email_verified_at' => now()])->save();

        $this->assignDefaultRole($user);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $raw
     */
    private function emailVerified(array $raw): bool
    {
        $flag = $raw['email_verified'] ?? null;

        if (is_bool($flag)) {
            return $flag;
        }

        if (is_string($flag)) {
            return filter_var($flag, FILTER_VALIDATE_BOOLEAN);
        }

        // Some IdPs omit email_verified when email is authoritative; refuse by default.
        return false;
    }

    private function assertActive(User $user): User
    {
        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => __('This account is inactive.'),
            ]);
        }

        return $user;
    }

    private function assertAllowedDomain(string $email): void
    {
        $domains = $this->project->allowedDomains();
        if ($domains === []) {
            return;
        }

        $at = strrpos($email, '@');
        $domain = $at === false ? null : substr($email, $at + 1);

        if ($domain === null || $domain === '' || ! in_array($domain, $domains, true)) {
            throw ValidationException::withMessages([
                'email' => __('Registration is restricted to allowed email domains.'),
            ]);
        }
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function splitName(string $name, string $email): array
    {
        if ($name !== '') {
            $parts = preg_split('/\s+/', $name, 2) ?: [];
            $first = $parts[0] ?? 'User';
            $last = $parts[1] ?? $first;

            return [$first, $last];
        }

        $local = Str::before($email, '@') ?: 'user';

        return [$local, $local];
    }

    private function assignDefaultRole(User $user): void
    {
        $roleName = $this->project->defaultUserRole();
        if ($roleName === null) {
            return;
        }

        $role = Role::query()
            ->where('name', $roleName)
            ->where('guard_name', config('auth.defaults.guard', 'web'))
            ->where('is_assignable', true)
            ->first();

        if ($role !== null) {
            $user->assignRole($role);
        }
    }
}
