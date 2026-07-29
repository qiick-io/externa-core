<?php

namespace App\Http\Middleware;

use App\Services\Settings\ProjectSettings;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * When project public_api_allowed_origins is non-empty, override CORS allowed_origins.
 * Runs before HandleCors so Fruitcake reads the effective list.
 */
class ConfigurePublicApiCors
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($this->appliesTo($request)) {
            $origins = app(ProjectSettings::class)->publicApiAllowedOrigins();
            if ($origins !== []) {
                config(['cors.allowed_origins' => $origins]);
            }
        }

        return $next($request);
    }

    private function appliesTo(Request $request): bool
    {
        return $request->is('api/*') || $request->is('api');
    }
}
