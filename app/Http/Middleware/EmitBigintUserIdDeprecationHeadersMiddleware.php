<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mark Public CMS v1 responses that still carry deprecated bigint user ids (#827).
 *
 * Emits `Deprecation`, `Sunset` (≥ 12 months) and `Link rel=deprecation` so clients can
 * discover the migration to `public_id` without reading the body schema alone.
 */
final class EmitBigintUserIdDeprecationHeadersMiddleware
{
    public const string SUNSET_HTTP_DATE = 'Sat, 20 Nov 2027 00:00:00 GMT';

    public const string DEPRECATION_DOCS_URL = 'https://docs.qiick.io/externa/upgrade#users-public-id';

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('Deprecation', 'true');
        $response->headers->set('Sunset', self::SUNSET_HTTP_DATE);
        $response->headers->set(
            'Link',
            '<'.self::DEPRECATION_DOCS_URL.'>; rel="deprecation"',
        );

        return $response;
    }
}
