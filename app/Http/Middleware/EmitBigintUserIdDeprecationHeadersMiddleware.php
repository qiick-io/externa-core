<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mark Public CMS v1 responses that still carry deprecated bigint user ids (#827).
 *
 * Emits `Deprecation` (RFC 9745 `@<unix-seconds>`), `Sunset` (one calendar year later) and
 * `Link rel=deprecation` so clients can discover the migration to `public_id`.
 *
 * Release process: the 1.6.0 release PR must set {@see DEPRECATION_UNIX} to the actual
 * release instant (UTC). {@see sunsetHttpDate()} follows as Deprecation plus one calendar year.
 * The OpenAPI YAML Deprecation / Sunset examples are literals pinned by a test — edit them by
 * hand to match (OpenApiController also overwrites the JSON examples at serve time).
 */
final class EmitBigintUserIdDeprecationHeadersMiddleware
{
    /**
     * Unix seconds for Deprecation `@…` = the 1.6.0 release instant (UTC).
     *
     * Provisional until ship: 2026-11-20 00:00:00 UTC. The release checklist updates this.
     */
    public const int DEPRECATION_UNIX = 1795132800;

    public const string DEPRECATION_DOCS_URL = 'https://docs.qiick.io/externa/upgrade#users-public-id';

    /**
     * HTTP-date for Sunset: {@see DEPRECATION_UNIX} plus one calendar year (UTC).
     */
    public static function sunsetHttpDate(): string
    {
        return (new DateTimeImmutable('@'.self::DEPRECATION_UNIX))
            ->setTimezone(new DateTimeZone('UTC'))
            ->modify('+1 year')
            ->format('D, d M Y H:i:s').' GMT';
    }

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('Deprecation', '@'.self::DEPRECATION_UNIX);
        $response->headers->set('Sunset', self::sunsetHttpDate());
        $response->headers->set(
            'Link',
            '<'.self::DEPRECATION_DOCS_URL.'>; rel="deprecation"',
        );

        return $response;
    }
}
