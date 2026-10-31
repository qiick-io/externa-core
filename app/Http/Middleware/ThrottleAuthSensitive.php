<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Symfony\Component\HttpFoundation\Response;

/**
 * IP throttle for Fortify POSTs that ship without limiters (#272).
 */
class ThrottleAuthSensitive
{
    /** @var list<string> */
    private const ROUTE_NAMES = [
        'register.store',
        'password.email',
        'password.update',
    ];

    public function __construct(private ThrottleRequests $throttle) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $name = $request->route()?->getName();
        if ($name === null || ! in_array($name, self::ROUTE_NAMES, true)) {
            return $next($request);
        }

        return $this->throttle->handle($request, $next, 'auth-sensitive');
    }
}
