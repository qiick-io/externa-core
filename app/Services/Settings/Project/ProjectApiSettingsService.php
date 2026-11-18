<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Api\PublicApiOriginService;
use App\Services\Settings\ProjectSettingsService;
use Illuminate\Support\Facades\Cache;

/**
 * Reads the API project settings: the browser origins allowed to call the public API.
 *
 * The origin list is read on every public API request (CORS + origin gate), so it
 * is kept in the application cache for a short TTL on top of the memoized
 * {@see ProjectSettingsService::raw()}; saving the API section forgets both.
 *
 * This area's keys of the stored bag are normalized here ({@see normalize()}),
 * and {@see ProjectSettingsService::raw()} composes them with the other areas.
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

    /**
     * Normalize the API keys of a stored `project` bag.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public function normalize(array $raw): array
    {
        return [
            'public_api_allowed_origins' => $this->normalizeOrigins($raw['public_api_allowed_origins'] ?? []),
        ];
    }

    /**
     * @return list<string>
     */
    private function normalizeOrigins(mixed $value): array
    {
        if (is_string($value)) {
            $value = preg_split('/[\s,]+/', $value) ?: [];
        }

        if (! is_array($value)) {
            return [];
        }

        $normalized = [];
        foreach ($value as $entry) {
            if (! is_string($entry)) {
                continue;
            }
            $origin = PublicApiOriginService::normalize($entry);
            if ($origin === null || in_array($origin, $normalized, true)) {
                continue;
            }
            $normalized[] = $origin;
        }

        return $normalized;
    }
}
