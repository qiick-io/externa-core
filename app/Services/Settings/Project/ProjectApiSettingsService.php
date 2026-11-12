<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Settings\ProjectSettingsService;
use Illuminate\Support\Facades\Cache;

/**
 * Reads the API project settings: the browser origins allowed to call the public API.
 *
 * The origin list is read on every public API request (CORS + origin gate), so it
 * is kept in the application cache for a short TTL on top of the memoized
 * {@see ProjectSettingsService::raw()}; saving the API section forgets both.
 */
class ProjectApiSettingsService
{
    public const PUBLIC_API_ORIGINS_CACHE_KEY = 'project.public_api_allowed_origins';

    /** Short TTL; forgotten on project settings save. */
    private const PUBLIC_API_ORIGINS_CACHE_TTL_SECONDS = 60;

    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    /**
     * Browser origins allowed for the public API when non-empty (CORS + request gate).
     *
     * @return list<string>
     */
    public function publicApiAllowedOrigins(): array
    {
        /** @var list<string> */
        return Cache::remember(
            self::PUBLIC_API_ORIGINS_CACHE_KEY,
            self::PUBLIC_API_ORIGINS_CACHE_TTL_SECONDS,
            fn (): array => $this->projectSettings->raw()['public_api_allowed_origins'],
        );
    }

    /**
     * Drop the short-lived origins cache after project settings change.
     */
    public function forgetPublicApiAllowedOriginsCache(): void
    {
        Cache::forget(self::PUBLIC_API_ORIGINS_CACHE_KEY);
        $this->projectSettings->forgetRawCache();
    }
}
