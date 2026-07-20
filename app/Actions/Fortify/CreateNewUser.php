<?php

namespace App\Actions\Fortify;

use App\Concerns\PasswordValidationRules;
use App\Concerns\ProfileValidationRules;
use App\Models\User;
use App\Services\Settings\ProjectSettings;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Contracts\CreatesNewUsers;
use Laravel\Fortify\Features;
use App\Models\Role;

/**
 * Fortify action that registers a new user from validated input.
 */
class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules, ProfileValidationRules;

    /**
     * Validate and create a newly registered user.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        $project = app(ProjectSettings::class);

        if (! Features::enabled(Features::registration()) || ! $project->registrationEnabled()) {
            throw ValidationException::withMessages([
                'email' => __('Registration is currently disabled.'),
            ]);
        }

        Validator::make($input, [
            ...$this->profileRules(),
            'password' => $this->passwordRules(),
        ])->after(function ($validator) use ($input, $project): void {
            $domains = $project->allowedDomains();
            if ($domains === []) {
                return;
            }

            $email = strtolower((string) ($input['email'] ?? ''));
            $at = strrpos($email, '@');
            $domain = $at === false ? null : substr($email, $at + 1);

            if ($domain === null || $domain === '' || ! in_array($domain, $domains, true)) {
                $validator->errors()->add(
                    'email',
                    __('Registration is restricted to allowed email domains.'),
                );
            }
        })->validate();

        $user = User::create([
            'first_name' => $input['first_name'],
            'last_name' => $input['last_name'],
            'email' => $input['email'],
            'password' => $input['password'],
        ]);

        if (! $project->emailVerificationRequired()) {
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        $roleName = $project->defaultUserRole();
        if ($roleName !== null) {
            $role = Role::query()
                ->where('name', $roleName)
                ->where('guard_name', config('auth.defaults.guard', 'web'))
                ->where('is_assignable', true)
                ->first();

            if ($role !== null) {
                $user->assignRole($role);
            }
        }

        return $user;
    }
}
