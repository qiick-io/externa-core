<?php

namespace App\Http\Middleware;

use App\Support\Http\UserContentResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Defense headers for admin HTML (Inertia/web). Skips API and responses that
 * already set Content-Security-Policy (e.g. {@see UserContentResponse}).
 */
class SetSecurityHeadersMiddleware
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! (bool) config('security.enabled', true)) {
            return $response;
        }

        // Public API / GraphQL clients must not inherit admin CSP.
        if ($request->is('api/*') || $request->is('graphql') || $request->is('api/graphql')) {
            return $response;
        }

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set(
            'X-Frame-Options',
            (string) config('security.x_frame_options', 'DENY'),
        );
        $response->headers->set(
            'Referrer-Policy',
            (string) config('security.referrer_policy', 'strict-origin-when-cross-origin'),
        );
        $response->headers->set(
            'Permissions-Policy',
            (string) config('security.permissions_policy'),
        );

        // Do not clobber user-content CSP sandbox.
        if (! $response->headers->has('Content-Security-Policy')) {
            $response->headers->set('Content-Security-Policy', $this->contentSecurityPolicy());
        }

        return $response;
    }

    private function contentSecurityPolicy(): string
    {
        $override = config('security.csp');
        if (is_string($override) && trim($override) !== '') {
            return trim($override);
        }

        $viteHttp = [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ];
        $viteWs = [
            'ws://localhost:5173',
            'ws://127.0.0.1:5173',
        ];

        $connect = array_merge(["'self'", 'ws:', 'wss:', 'http:', 'https:'], $viteHttp, $viteWs);
        $script = array_merge(["'self'", "'unsafe-inline'", "'unsafe-eval'"], $viteHttp);
        $style = array_merge(["'self'", "'unsafe-inline'"], $viteHttp);

        return implode('; ', [
            "default-src 'self'",
            'script-src '.implode(' ', $script),
            'style-src '.implode(' ', $style),
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            'connect-src '.implode(' ', $connect),
            "media-src 'self' blob:",
            "worker-src 'self' blob:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
        ]);
    }
}
