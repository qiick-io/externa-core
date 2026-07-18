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
            'files.download', 'files.download-many', 'files.zips.download' => PermissionEnum::CanDownloadFiles,
            'files.favorite', 'files.unfavorite' => PermissionEnum::CanFavoriteFiles,
            'files.copy' => PermissionEnum::CanCopyFiles,
            'files.replace' => PermissionEnum::CanReplaceFiles,
            'files.tags' => PermissionEnum::CanTagFiles,
            'files.update' => PermissionEnum::CanUpdateFileMetadata,
            'files.bulk' => $this->bulkPermission($request),
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

    protected function bulkPermission(Request $request): PermissionEnum
    {
        return match ($request->input('action')) {
            'restore' => PermissionEnum::CanRestoreFiles,
            'force_delete' => PermissionEnum::CanForceDeleteFiles,
            'favorite', 'unfavorite' => PermissionEnum::CanFavoriteFiles,
            'tag', 'untag' => PermissionEnum::CanTagFiles,
            'copy' => PermissionEnum::CanCopyFiles,
            'delete' => PermissionEnum::CanDeleteFiles,
            'move' => PermissionEnum::CanEditFiles,
            default => PermissionEnum::CanEditFiles,
        };
    }
}
