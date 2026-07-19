<?php

namespace App\Http\Middleware;

use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Http\Request;
use Inertia\Middleware;

/**
 * Share auth, sidebar, locale, and notification props with every Inertia page.
 */
class HandleInertiaRequests extends Middleware
{
    /**
     * Blade root view used for the initial Inertia document shell.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Resolve the asset version used to bust cached frontend bundles.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Merge application-wide props into the Inertia shared payload.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();
        $permissionResolver = app(EffectivePermissionResolver::class);

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $user,
                'permissions' => $user ? $permissionResolver->permissionsFor($user) : [],
                'roleNames' => $user ? $permissionResolver->roleNamesFor($user) : [],
                'isSuperAdmin' => $user ? $permissionResolver->isSuperAdmin($user) : false,
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'collectionLocales' => config('collections.locales', ['en', 'it']),
            'notifications' => [
                'unread_count' => $user ? $user->unreadNotifications()->count() : 0,
            ],
        ];
    }
}
