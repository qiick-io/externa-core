<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\SettingsRepositoryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The issuer string `oidc:import-legacy-subjects` used when copying `users.oidc_sub`.
 *
 * Persisted as `oidc_legacy_import_issuer` so the dual-read bridge keeps bridging under the
 * import's issuer after Settings → Authentication & Security changes the live IdP. Read and
 * written on the settings table directly (not only through SettingsRepositoryService) so the
 * OIDC import migration can run before `scope_ref` exists in the same migrate batch (#827).
 */
final readonly class OidcLegacyImportIssuerService
{
    public const string SETTING_KEY = 'oidc_legacy_import_issuer';

    /**
     * The issuer last written by the import, or null when nothing was imported yet.
     */
    public function issuer(): ?string
    {
        $query = DB::table('settings')
            ->where('scope', SettingsRepositoryService::SCOPE_PROJECT)
            ->where('group', 'project')
            ->where('key', self::SETTING_KEY);

        if (Schema::hasColumn('settings', 'scope_ref')) {
            $query->where('scope_ref', SettingsRepositoryService::SCOPE_REF_INSTANCE);
        } else {
            $query->whereNull('scope_id');
        }

        $storedValue = $query->value('value');
        $issuer = is_string($storedValue) ? json_decode($storedValue) : null;

        return is_string($issuer) && trim($issuer) !== '' ? trim($issuer) : null;
    }

    /**
     * Remember the issuer an import just ran with (migration or artisan command).
     *
     * Side effects: upserts the project setting (raw DB so mid-migrate works) and clears the
     * project settings memo.
     */
    public function remember(string $issuer): void
    {
        $trimmedIssuer = trim($issuer);

        if ($trimmedIssuer === '') {
            return;
        }

        $now = now();
        $payload = [
            'scope' => SettingsRepositoryService::SCOPE_PROJECT,
            'scope_id' => null,
            'group' => 'project',
            'key' => self::SETTING_KEY,
            'value' => json_encode($trimmedIssuer),
            'updated_at' => $now,
        ];

        if (Schema::hasColumn('settings', 'scope_ref')) {
            $payload['scope_ref'] = SettingsRepositoryService::SCOPE_REF_INSTANCE;
        }

        $existing = DB::table('settings')
            ->where('scope', SettingsRepositoryService::SCOPE_PROJECT)
            ->where('group', 'project')
            ->where('key', self::SETTING_KEY)
            ->when(
                Schema::hasColumn('settings', 'scope_ref'),
                fn ($query) => $query->where('scope_ref', SettingsRepositoryService::SCOPE_REF_INSTANCE),
                fn ($query) => $query->whereNull('scope_id'),
            )
            ->first();

        if ($existing !== null) {
            DB::table('settings')->where('id', $existing->id)->update($payload);
        } else {
            DB::table('settings')->insert($payload + ['created_at' => $now]);
        }

        if (app()->bound(ProjectSettingsService::class)) {
            app(ProjectSettingsService::class)->forgetRawCache();
        }
    }
}
