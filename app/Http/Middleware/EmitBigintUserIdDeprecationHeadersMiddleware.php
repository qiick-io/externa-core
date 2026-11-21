<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mark Public CMS v1 responses that still carry deprecated bigint user ids (#827).
 *
 * Emits `Deprecation` (RFC 9745 `@<unix-seconds>`), `Sunset` (≥ 12 months later) and
 * `Link rel=deprecation` so clients can discover the migration to `public_id`.
 *
 * Release process: the 1.6.0 release PR must set {@see DEPRECATION_UNIX} to the
 * actual release instant (UTC) and keep {@see SUNSET_HTTP_DATE} at least 12 months after.
 */
final class EmitBigintUserIdDeprecationHeadersMiddleware
{
    /**
     * Unix seconds for Deprecation `@…` = the 1.6.0 release instant (UTC).
     *
     * Provisional until ship: 2026-11-20 00:00:00 UTC. Override in the release PR if the
     * tag day differs.
     */
    public const int DEPRECATION_UNIX = 1795132800;

    /**
     * HTTP-date for Sunset; must be ≥ 12 months after {@see DEPRECATION_UNIX}.
     */
    public const string SUNSET_HTTP_DATE = 'Sat, 20 Nov 2027 00:00:00 GMT';

    public const string DEPRECATION_DOCS_URL = 'https://docs.qiick.io/externa/upgrade#users-public-id';

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('Deprecation', '@'.self::DEPRECATION_UNIX);
        $response->headers->set('Sunset', self::SUNSET_HTTP_DATE);
        $response->headers->set(
            'Link',
            '<'.self::DEPRECATION_DOCS_URL.'>; rel="deprecation"',
        );

        return $response;
    }
}
