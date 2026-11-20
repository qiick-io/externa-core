<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Support\Facades\DB;

/**
 * The issuer string `oidc:import-legacy-subjects` used when copying `users.oidc_sub`.
 *
 * Persisted as `oidc_legacy_import_issuer` so the dual-read bridge keeps bridging under the
 * import's issuer after Settings → Authentication & Security changes the live IdP. Read from
 * the settings table directly (not the normalized project bag) so a security-form save cannot
 * drop it.
 */
final readonly class OidcLegacyImportIssuerService
{
    public const string SETTING_KEY = 'oidc_legacy_import_issuer';

    public function __construct(private SettingsRepositoryService $settings) {}

    /**
     * The issuer last written by the import, or null when nothing was imported yet.
     */
    public function issuer(): ?string
    {
        $storedValue = DB::table('settings')
            ->where('scope', SettingsRepositoryService::SCOPE_PROJECT)
            ->whereNull('scope_id')
            ->where('group', 'project')
            ->where('key', self::SETTING_KEY)
            ->value('value');

        $issuer = is_string($storedValue) ? json_decode($storedValue) : null;

        return is_string($issuer) && trim($issuer) !== '' ? trim($issuer) : null;
    }

    /**
     * Remember the issuer an import just ran with (migration or artisan command).
     *
     * Side effects: upserts the project setting and clears the project settings memo.
     */
    public function remember(string $issuer): void
    {
        $trimmedIssuer = trim($issuer);

        if ($trimmedIssuer === '') {
            return;
        }

        $this->settings->setMany(SettingsRepositoryService::SCOPE_PROJECT, 'project', [
            self::SETTING_KEY => $trimmedIssuer,
        ]);
    }
}
