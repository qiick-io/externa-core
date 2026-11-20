<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Auth\OidcLegacyImportIssuerService;
use Illuminate\Console\Command;
use Qiick\Oidc\Console\ImportLegacySubjectsCommand;
use Symfony\Component\Console\Input\ArrayInput;

/**
 * Externa's `oidc:import-legacy-subjects`: requires `--issuer`, and persists that issuer only
 * after a successful non-dry run so a failed re-import after an IdP switch cannot retarget the
 * dual-read bridge (#828).
 *
 * Replaces the package command of the same name (registered later in {@see AppServiceProvider}).
 */
final class ImportLegacyOidcSubjectsCommand extends Command
{
    protected $signature = 'oidc:import-legacy-subjects
        {--column=oidc_sub : Column of the users table that holds the legacy sub}
        {--issuer= : Issuer of those subjects (required in Externa)}
        {--dry-run : Report what would be imported without writing}';

    protected $description = 'Import legacy users.oidc_sub values into user_identities';

    /**
     * Run the package importer, then remember the issuer only when the run succeeded.
     *
     * Side effects: may insert `user_identities` rows; on success without `--dry-run`, upserts
     * `oidc_legacy_import_issuer`.
     */
    public function handle(OidcLegacyImportIssuerService $legacyImportIssuer): int
    {
        $issuerOption = $this->option('issuer');

        if (! is_string($issuerOption) || trim($issuerOption) === '') {
            $this->error('In Externa, --issuer is required (do not fall back to the Settings issuer after an IdP switch).');

            return self::FAILURE;
        }

        $issuer = trim($issuerOption);
        $isDryRun = (bool) $this->option('dry-run');
        $columnOption = $this->option('column');
        $column = is_string($columnOption) && $columnOption !== '' ? $columnOption : 'oidc_sub';

        $packageCommand = $this->laravel->make(ImportLegacySubjectsCommand::class);
        $packageCommand->setLaravel($this->laravel);

        $exitCode = $packageCommand->run(
            new ArrayInput([
                '--column' => $column,
                '--issuer' => $issuer,
                '--dry-run' => $isDryRun,
            ], $packageCommand->getDefinition()),
            $this->output,
        );

        if ($exitCode === self::SUCCESS && ! $isDryRun) {
            $legacyImportIssuer->remember($issuer);
        }

        return $exitCode;
    }
}
