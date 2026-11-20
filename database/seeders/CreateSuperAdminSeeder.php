<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Actions\CreateInitialSuperAdminAction;
use App\Data\InitialSuperAdminData;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Creates the initial super-admin from config/super_admin.php (#821).
 *
 * In `local` and `testing`, any non-empty `INITIAL_SUPER_ADMIN_PASSWORD` is enough
 * (`.env.example` keeps `password`). Outside those environments the password must be
 * set, must not be the literal `password` (case-insensitive), and must pass
 * `Password::defaults()` — so Docker `RUN_SEED=true` with a strong env password still
 * creates the first admin, while the known default cannot.
 *
 * An existing user with that email is left untouched.
 */
class CreateSuperAdminSeeder extends Seeder
{
    /** The environments where a weak local seed password is allowed. */
    public const ENVIRONMENTS = ['local', 'testing'];

    /**
     * Why the password must not be used for seeding, or null when it is acceptable.
     */
    public static function passwordRejectionReason(?string $password, string $environment): ?string
    {
        if (! is_string($password) || $password === '') {
            return 'INITIAL_SUPER_ADMIN_PASSWORD is empty.';
        }

        if (in_array($environment, self::ENVIRONMENTS, true)) {
            return null;
        }

        if (strcasecmp($password, 'password') === 0) {
            return 'the default password "password" is not allowed outside local and testing.';
        }

        $validator = Validator::make(
            ['password' => $password],
            ['password' => ['required', 'string', Password::defaults()]],
        );

        if ($validator->fails()) {
            return 'INITIAL_SUPER_ADMIN_PASSWORD does not meet the password rules.';
        }

        return null;
    }

    /**
     * Whether externa:install must supply credentials because seeding will not create an admin.
     *
     * Local/testing never prompts (the seeder owns the weak local password); outside those
     * environments any rejected password (empty, default, or too weak) needs a prompt.
     */
    public static function installNeedsCredentials(string $environment, ?string $password): bool
    {
        if (in_array($environment, self::ENVIRONMENTS, true)) {
            return false;
        }

        return self::passwordRejectionReason($password, $environment) !== null;
    }

    /**
     * Non-interactive installs must not invent a production admin password.
     */
    public static function installMustFailClosed(bool $isInteractive, string $environment, ?string $password): bool
    {
        return ! $isInteractive && self::installNeedsCredentials($environment, $password);
    }

    /**
     * Create the super-admin when the environment and password allow it.
     */
    public function run(CreateInitialSuperAdminAction $createInitialSuperAdmin): void
    {
        $environment = (string) app()->environment();
        $password = config('super_admin.password');
        $password = is_string($password) ? $password : null;
        $rejection = self::passwordRejectionReason($password, $environment);

        if ($rejection !== null || $password === null) {
            $this->command?->warn('Skipped the development super-admin: '.$rejection);

            return;
        }

        $createInitialSuperAdmin->execute(new InitialSuperAdminData(
            firstName: (string) config('super_admin.first_name'),
            lastName: (string) config('super_admin.last_name'),
            email: (string) config('super_admin.email'),
            password: $password,
        ));
    }
}
