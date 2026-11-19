<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Actions\CreateInitialSuperAdminAction;
use App\Data\InitialSuperAdminData;
use Illuminate\Database\Seeder;

/**
 * Creates a development super-admin from config/super_admin.php, so `db:seed` gives a
 * local checkout a login.
 *
 * Only in `local` and `testing`, and only with a password set in `.env` (#821): a server
 * that runs `migrate --seed --force` must never get a known-credential account. Servers
 * create the first admin through `externa:install` (prompt or INITIAL_SUPER_ADMIN_*).
 *
 * An existing user with that email is left untouched (released product: never rewrite
 * an admin on re-seed or upgrade).
 */
class CreateSuperAdminSeeder extends Seeder
{
    /** The environments where a seeded login is a convenience, not a risk. */
    public const ENVIRONMENTS = ['local', 'testing'];

    /**
     * Whether externa:install must supply credentials because this seeder will not.
     */
    public static function installNeedsCredentials(string $environment, ?string $password): bool
    {
        if (in_array($environment, self::ENVIRONMENTS, true)) {
            return false;
        }

        return ! is_string($password) || $password === '';
    }

    /**
     * Non-interactive installs must not invent a production admin password.
     */
    public static function installMustFailClosed(bool $isInteractive, string $environment, ?string $password): bool
    {
        return ! $isInteractive && self::installNeedsCredentials($environment, $password);
    }

    /**
     * Create the development super-admin when the environment and password allow it.
     */
    public function run(CreateInitialSuperAdminAction $createInitialSuperAdmin): void
    {
        if (! app()->environment(self::ENVIRONMENTS)) {
            $this->command?->warn('Skipped the development super-admin outside local and testing: create the first admin with `php artisan externa:install`.');

            return;
        }

        $password = config('super_admin.password');

        if (! is_string($password) || $password === '') {
            $this->command?->warn('Skipped the development super-admin: INITIAL_SUPER_ADMIN_PASSWORD is empty.');

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
