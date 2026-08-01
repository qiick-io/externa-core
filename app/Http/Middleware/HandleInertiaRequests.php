<?php

namespace App\Http\Middleware;

use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Dashboard\DashboardHealthMetrics;
use App\Services\Settings\ProjectAppearance;
use App\Services\Settings\ProjectSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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
        $projectAppearance = app(ProjectAppearance::class)->shared();
        $projectSettings = app(ProjectSettings::class);

        return [
            ...parent::share($request),
            'name' => $projectSettings->displayName(),
            // ponytail: composer.json is the single version source; package.json mirrors it for npm tooling
            'appVersion' => once(function (): string {
                $composer = json_decode(
                    (string) file_get_contents(base_path('composer.json')),
                    true,
                );

                return is_array($composer) && is_string($composer['version'] ?? null)
                    ? $composer['version']
                    : 'dev';
            }),
            'auth' => [
                'user' => $user,
                'permissions' => $user ? $permissionResolver->permissionsFor($user) : [],
                'roleNames' => $user ? $permissionResolver->roleNamesFor($user) : [],
                'isSuperAdmin' => $user ? $permissionResolver->isSuperAdmin($user) : false,
            ],
            'locale' => app()->getLocale(),
            'availableLocales' => config('i18n.available_locales', ['en' => 'English']),
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'collectionLocales' => $projectSettings->contentLocales(),
            'collectionLocaleMeta' => $projectSettings->contentLocaleMeta(),
            'defaultContentLocale' => $projectSettings->defaultContentLocale(),
            'notifications' => [
                'unread_count' => $user ? $user->unreadNotifications()->count() : 0,
            ],
            'healthBadge' => $user
                ? Cache::remember(
                    'health-badge',
                    now()->addSeconds(60),
                    fn (): array => app(DashboardHealthMetrics::class)->badge(),
                )
                : null,
            'realtime' => [
                'enabled' => ! in_array(
                    (string) config('broadcasting.default'),
                    ['log', 'null', ''],
                    true,
                ),
                'broadcaster' => (string) config('broadcasting.default'),
            ],
            'projectAppearance' => $projectAppearance,
            'projectSettings' => $projectSettings->shared(),
            'flash' => [
                'success' => fn (): mixed => $request->session()->get('success'),
                'error' => fn (): mixed => $request->session()->get('error'),
                'plain_text_api_key' => fn (): mixed => $request->session()->get('plain_text_api_key'),
            ],
        ];
    }
}
