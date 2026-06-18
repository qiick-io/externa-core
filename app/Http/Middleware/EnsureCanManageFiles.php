<?php

namespace App\Http\Middleware;

use App\Enums\PermissionEnum;
use App\Services\Authorization\EffectivePermissionResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureCanManageFiles
{
    public function __construct(
        protected EffectivePermissionResolver $permissionResolver,
    ) {}

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user === null) {
            abort(403);
        }

        $routeName = $request->route()?->getName();

        $permission = match ($routeName) {
            'files.restore' => PermissionEnum::CanRestoreFiles,
            'files.force-delete' => PermissionEnum::CanForceDeleteFiles,
            default => match ($request->method()) {
                'GET', 'HEAD' => PermissionEnum::CanShowFiles,
                'POST' => PermissionEnum::CanCreateFiles,
                'PUT', 'PATCH' => PermissionEnum::CanEditFiles,
                'DELETE' => PermissionEnum::CanDeleteFiles,
                default => PermissionEnum::CanShowFiles,
            },
        };

        if (! $this->permissionResolver->hasPermission($user, $permission->value)) {
            abort(403);
        }

        return $next($request);
    }
}
