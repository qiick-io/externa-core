<?php

namespace App\Http\Middleware;

use App\Http\Responses\UserContentResponse;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
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

    /**
     * Build the default admin CSP, or return the SECURITY_CSP override verbatim.
     *
     * Adds the running Vite dev server to script/style/font/img sources and the
     * configured files disk origin (S3 / GCS / Azure / CDN) to img/media sources.
     */
    private function contentSecurityPolicy(): string
    {
        $override = config('security.csp');
        if (is_string($override) && trim($override) !== '') {
            return trim($override);
        }

        // Vite dev server from public/hot (http://127.0.0.1:5173, or https://{HERD_SITE}:5173).
        $developmentServerOrigins = $this->originsOf([Vite::devServerUrl()]);
        // Public file URLs (FileTransformService::publicUrl) live on the files disk `url`.
        $filesDiskOrigins = $this->originsOf([
            config('filesystems.disks.'.config('files.disk').'.url'),
        ]);

        // connect-src stays open for Reverb/Echo websockets and Vite HMR.
        $connectSources = ["'self'", 'ws:', 'wss:', 'http:', 'https:'];
        $scriptSources = array_merge(["'self'", "'unsafe-inline'", "'unsafe-eval'"], $developmentServerOrigins);
        $styleSources = array_merge(["'self'", "'unsafe-inline'"], $developmentServerOrigins);
        $fontSources = array_merge(["'self'", 'data:'], $developmentServerOrigins);
        $imageSources = array_merge(["'self'", 'data:', 'blob:', 'https:'], $developmentServerOrigins, $filesDiskOrigins);
        $mediaSources = array_merge(["'self'", 'blob:'], $filesDiskOrigins);

        return implode('; ', [
            "default-src 'self'",
            'script-src '.implode(' ', $scriptSources),
            'style-src '.implode(' ', $styleSources),
            'img-src '.implode(' ', array_unique($imageSources)),
            'font-src '.implode(' ', $fontSources),
            'connect-src '.implode(' ', $connectSources),
            'media-src '.implode(' ', $mediaSources),
            "worker-src 'self' blob:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
        ]);
    }

    /**
     * Reduce absolute http(s) URLs to CSP source origins (`scheme://host[:port]`).
     *
     * ponytail: only the configured `files.disk` is allowed; files still stored on a
     * previous disk after a FILES_DISK switch need a full SECURITY_CSP override.
     *
     * @param  list<mixed>  $urls
     * @return list<string>
     */
    private function originsOf(array $urls): array
    {
        $origins = [];

        foreach ($urls as $url) {
            if (! is_string($url)) {
                continue;
            }

            $scheme = parse_url($url, PHP_URL_SCHEME);
            $host = parse_url($url, PHP_URL_HOST);
            $port = parse_url($url, PHP_URL_PORT);

            if (! in_array($scheme, ['http', 'https'], true) || ! is_string($host) || $host === '') {
                continue;
            }

            $origins[] = $scheme.'://'.$host.(is_int($port) ? ':'.$port : '');
        }

        return $origins;
    }
}
