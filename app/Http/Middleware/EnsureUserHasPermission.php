<?php

namespace App\Http\Middleware;

use App\Services\Authorization\EffectivePermissionResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasPermission
{
    public function __construct(
        private readonly EffectivePermissionResolver $permissionResolver,
    ) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();

        if ($user === null || ! $this->permissionResolver->hasPermission($user, $permission)) {
            abort(403);
        }

        return $next($request);
    }
}
