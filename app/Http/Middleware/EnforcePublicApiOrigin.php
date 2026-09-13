<?php

namespace App\Http\Middleware;

use App\Models\ApiKey;
use App\Services\Settings\ProjectSettings;
use App\Support\Api\PublicApiOrigin;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * When project origin allowlist is active: browsers must match; non-browser calls need a valid API key.
 */
class EnforcePublicApiOrigin
{
    public function handle(Request $request, Closure $next): Response
    {
        $allowlist = app(ProjectSettings::class)->publicApiAllowedOrigins();
        if ($allowlist === []) {
            return $next($request);
        }

        $originHeader = $request->headers->get('Origin');
        if (is_string($originHeader) && $originHeader !== '') {
            $origin = PublicApiOrigin::normalize($originHeader);
            if ($origin === null || ! in_array($origin, $allowlist, true)) {
                return response()->json(['message' => 'Origin not allowed.'], 403);
            }

            return $next($request);
        }

        $bearer = $request->bearerToken();
        if ($bearer === null || $bearer === '' || ! $this->isValidApiKey($bearer)) {
            return response()->json(['message' => 'Origin required or API key.'], 403);
        }

        return $next($request);
    }

    private function isValidApiKey(string $bearer): bool
    {
        $apiKey = ApiKey::query()
            ->where('key_hash', ApiKey::hashSecret($bearer))
            ->first();

        return $apiKey !== null && $apiKey->isActive();
    }
}
