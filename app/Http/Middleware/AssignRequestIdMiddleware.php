<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\StructuredLogContextKeyEnum;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Give every request an `X-Request-Id` (#209).
 *
 * A well-formed incoming id (from a proxy or load balancer) is kept so logs can be joined
 * across hops; anything else is replaced with a fresh UUID. The id goes into hidden Context
 * (the `structured` log channel reads it, queued jobs inherit it) and onto every response.
 * Registered as the outermost global middleware, so 401/404/429/503 responses carry it too.
 */
class AssignRequestIdMiddleware
{
    public const string HEADER = 'X-Request-Id';

    /** Letters, digits and `-_.:`, 8–128 chars: UUIDs, ULIDs and common proxy ids, nothing that can forge a log line. */
    private const string VALID_ID_PATTERN = '/\A[A-Za-z0-9\-_.:]{8,128}\z/';

    public function handle(Request $request, Closure $next): Response
    {
        $requestId = $this->resolveRequestId($request->headers->get(self::HEADER));

        $request->headers->set(self::HEADER, $requestId);
        Context::addHidden(StructuredLogContextKeyEnum::RequestId->value, $requestId);

        $response = $next($request);
        $response->headers->set(self::HEADER, $requestId);

        return $response;
    }

    private function resolveRequestId(?string $incoming): string
    {
        if ($incoming !== null && preg_match(self::VALID_ID_PATTERN, $incoming) === 1) {
            return $incoming;
        }

        return (string) Str::uuid7();
    }
}
