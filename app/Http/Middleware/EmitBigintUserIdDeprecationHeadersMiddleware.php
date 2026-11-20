<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mark Public CMS v1 responses that still carry deprecated bigint user ids (#827).
 *
 * Emits `Deprecation` (RFC 9745 `@<unix-seconds>`), `Sunset` (≥ 12 months) and
 * `Link rel=deprecation` so clients can discover the migration to `public_id`.
 */
final class EmitBigintUserIdDeprecationHeadersMiddleware
{
    /** HTTP-date for Sunset; paired with {@see DEPRECATION_UNIX}. */
    public const string SUNSET_HTTP_DATE = 'Sat, 20 Nov 2027 00:00:00 GMT';

    /** Unix seconds for Deprecation `@…` (same instant as {@see SUNSET_HTTP_DATE}). */
    public const int DEPRECATION_UNIX = 1826668800;

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
