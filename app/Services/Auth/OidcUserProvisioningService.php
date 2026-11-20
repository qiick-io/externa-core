<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Models\Role;
use App\Models\User;
use App\Services\Settings\Project\ProjectSecuritySettingsService;
use Illuminate\Support\Str;
use Qiick\Oidc\Contracts\UserProvisioningContract;
use Qiick\Oidc\Data\AuthenticatedIdentityData;

/**
 * Creates the local user of a just-in-time SSO login (Settings → Authentication & Security → JIT):
 * an active account without a password, so it can only sign in through SSO until an admin or a
 * password reset gives it one. The configured default assignable role is attached when present.
 *
 * Names follow the qiick rule (AuthenticatedIdentityData::personName()): `given_name` and
 * `family_name`, else `name` with its last word as the last name, else the email's local part.
 * A missing family name becomes `''` because `users.last_name` is not nullable.
 */
final readonly class OidcUserProvisioningService implements UserProvisioningContract
{
    public function __construct(private ProjectSecuritySettingsService $securitySettings) {}

    /**
     * @param  string  $email  verified and lower-cased by the package
     */
    public function provision(AuthenticatedIdentityData $identity, string $email): User
    {
        $personName = $identity->personName();

        $user = (new User)->forceFill([
            'first_name' => $personName?->givenName ?: Str::before($email, '@'),
            'last_name' => $personName?->familyName ?: '',
            'email' => $email,
            'password' => null,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $user->save();

        $this->assignDefaultRole($user);

        return $user;
    }

    private function assignDefaultRole(User $user): void
    {
        $roleName = $this->securitySettings->defaultUserRole();

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
