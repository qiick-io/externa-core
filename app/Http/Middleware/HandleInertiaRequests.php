<?php

namespace App\Http\Middleware;

use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
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
