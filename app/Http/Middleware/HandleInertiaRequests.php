<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\PermissionEnum;
use App\Services\AppVersionService;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Chat\ChatUnreadService;
use App\Services\Dashboard\DashboardHealthMetricsService;
use App\Services\Deploy\DeployHookStatusService;
use App\Services\Settings\ProjectAppearanceService;
use App\Services\Settings\ProjectSettingsService;
use App\Services\Settings\UserNotificationPreferencesService;
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
        $permissionResolver = app(EffectivePermissionResolverService::class);
        $projectAppearance = app(ProjectAppearanceService::class)->shared();
        $projectSettings = app(ProjectSettingsService::class);

        return [
            ...parent::share($request),
            'name' => $projectSettings->displayName(),
            'appVersion' => app(AppVersionService::class)->current(),
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
            'notificationSounds' => fn (): array => $user
                ? app(UserNotificationPreferencesService::class)->shared($user)
                : [
                    'sound_chat_enabled' => false,
                    'sound_notifications_enabled' => false,
                ],
            'chat' => fn (): array => $user && $permissionResolver->hasPermission($user, PermissionEnum::CanShowChat->value)
                ? app(ChatUnreadService::class)->shared($user)
                : [
                    'unread_count' => 0,
                    'unread_private' => 0,
                    'unread_collection' => 0,
                ],
            'healthBadge' => $user
                ? Cache::remember(
                    'health-badge',
                    now()->addSeconds(60),
                    fn (): array => app(DashboardHealthMetricsService::class)->badge(),
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
            'deploy' => function () use ($user, $permissionResolver, $projectSettings): array {
                $canTrigger = $user !== null
                    && $permissionResolver->hasPermission($user, PermissionEnum::DeployTrigger->value);
                $hooks = $canTrigger
                    ? array_map(
                        static fn ($hook): array => [
                            'id' => $hook->id,
                            'name' => $hook->name,
                        ],
                        $projectSettings->deployHooks(),
                    )
                    : [];

                return [
                    'canTrigger' => $canTrigger && $hooks !== [],
                    'hooks' => $hooks,
                    'lastRun' => $canTrigger
                        ? app(DeployHookStatusService::class)->lastRun()
                        : null,
                ];
            },
            'flash' => [
                'success' => fn (): mixed => $request->session()->get('success'),
                'error' => fn (): mixed => $request->session()->get('error'),
                'plain_text_api_key' => fn (): mixed => $request->session()->get('plain_text_api_key'),
            ],
        ];
    }
}
