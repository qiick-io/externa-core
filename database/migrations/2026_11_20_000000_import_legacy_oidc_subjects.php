<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Console\Output\BufferedOutput;
use Symfony\Component\Console\Output\ConsoleOutput;

/**
 * Moves SSO users onto qiick/laravel-oidc (#827) on every upgrade path, `externa:upgrade` and
 * the Docker entrypoint alike (both only run `migrate`), so no SSO user is locked out between
 * the upgrade and a manual step:
 *
 * 1. `users.oidc_sub` is copied into `user_identities` by the package's own
 *    `oidc:import-legacy-subjects`, with the issuer exactly as saved in Settings → Authentication
 *    & Security (the string the package compares with discovery and stores on new links). It is
 *    idempotent and never moves an identity that is already linked to another user: such a
 *    conflict is printed and skipped, and the upgrade goes on (re-run the command after fixing).
 * 2. Installs that had configured SSO keep linking existing users by verified email, as the
 *    local client always did: `oidc_auto_link` is stored as true unless it is already set. New
 *    installs get the package default (off).
 *
 * Without a saved issuer there is nothing to import. `users.oidc_sub` stays for this release;
 * dual-read still signs those users in if an identity row was missed. The next release drops
 * the column in a forward-only migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        $issuer = $this->savedIssuer();

        if ($issuer === null) {
            return;
        }

        if (! $this->projectSettingExists('oidc_auto_link')) {
            DB::table('settings')->insert([
                'scope' => 'project',
                'scope_id' => null,
                'group' => 'project',
                'key' => 'oidc_auto_link',
                'value' => json_encode(true),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $output = app()->runningUnitTests() ? new BufferedOutput : new ConsoleOutput;
        $exitCode = Artisan::call('oidc:import-legacy-subjects', ['--issuer' => $issuer], $output);

        if ($exitCode !== 0) {
            $output->writeln('<comment>Some SSO identities were not imported (see above). Fix them, then run: php artisan oidc:import-legacy-subjects --issuer='.escapeshellarg($issuer).'</comment>');
        }
    }

    /**
     * The `oidc_issuer` project setting as stored (JSON), trimmed, or null.
     */
    private function savedIssuer(): ?string
    {
        $storedValue = DB::table('settings')
            ->where('scope', 'project')
            ->whereNull('scope_id')
            ->where('group', 'project')
            ->where('key', 'oidc_issuer')
            ->value('value');

        $issuer = is_string($storedValue) ? json_decode($storedValue) : null;

        return is_string($issuer) && trim($issuer) !== '' ? trim($issuer) : null;
    }

    private function projectSettingExists(string $key): bool
    {
        return DB::table('settings')
            ->where('scope', 'project')
            ->whereNull('scope_id')
            ->where('group', 'project')
            ->where('key', $key)
            ->exists();
    }
};
