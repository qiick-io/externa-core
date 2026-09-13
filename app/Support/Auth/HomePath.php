<?php

namespace App\Support\Auth;

use App\Enums\PermissionEnum;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;
use Throwable;

/**
 * Resolve the first admin surface a user is allowed to open after login.
 */
final class HomePath
{
    /**
     * Guest auth screens that must never be reused as post-login "intended".
     *
     * @var list<string>
     */
    private const GUEST_AUTH_PATHS = [
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/two-factor-challenge',
        '/email/verify',
        '/confirm-password',
    ];

    /**
     * @return non-empty-string Absolute path (not a full URL).
     */
    public static function for(?Authenticatable $user): string
    {
        if ($user === null) {
            return '/login';
        }

        // Ordered by “default home” preference; first permitted wins.
        $candidates = [
            [PermissionEnum::CanShowDashboard, '/dashboard'],
            [PermissionEnum::CanShowFiles, '/files'],
            [PermissionEnum::CanShowCollections, '/collections'],
            [PermissionEnum::CanUseAi, '/ai'],
            [PermissionEnum::CanShowUsers, '/users'],
            [PermissionEnum::CanShowActivityLogs, '/activity-logs'],
        ];

        $resolver = app(EffectivePermissionResolver::class);

        foreach ($candidates as [$permission, $path]) {
            if ($user instanceof User && $resolver->hasPermission($user, $permission->value)) {
                return $path;
            }
        }

        // Authenticated users can always reach their profile settings.
        return '/settings/profile';
    }

    /**
     * Prefer a safe session "intended" URL; otherwise permission-aware home.
     *
     * Stale intended targets (deleted routes, auth screens) 404 after login. Inertia then
     * paints that HTML 404 in a modal while the address bar stays on /login.
     *
     * @return non-empty-string Absolute path (not a full URL).
     */
    public static function afterLogin(Request $request): string
    {
        $fallback = self::for($request->user());

        if (! $request->hasSession()) {
            return $fallback;
        }

        $intended = $request->session()->pull('url.intended');

        if (! is_string($intended) || $intended === '') {
            return $fallback;
        }

        $path = self::pathFromUrl($intended);

        if ($path === null || self::isGuestAuthPath($path) || ! self::isResolvableGetPath($path)) {
            return $fallback;
        }

        return $path;
    }

    /**
     * @return non-empty-string|null
     */
    private static function pathFromUrl(string $url): ?string
    {
        if (str_starts_with($url, '/')) {
            $path = parse_url($url, PHP_URL_PATH);

            return is_string($path) && $path !== '' ? $path : null;
        }

        $appUrl = (string) config('app.url');
        $appHost = parse_url($appUrl, PHP_URL_HOST);
        $urlHost = parse_url($url, PHP_URL_HOST);
        $path = parse_url($url, PHP_URL_PATH);

        if (! is_string($appHost) || ! is_string($urlHost) || strcasecmp($appHost, $urlHost) !== 0) {
            return null;
        }

        if (! is_string($path) || $path === '') {
            return '/';
        }

        return $path;
    }

    private static function isGuestAuthPath(string $path): bool
    {
        $normalized = rtrim($path, '/') ?: '/';

        foreach (self::GUEST_AUTH_PATHS as $guestPath) {
            if ($normalized === $guestPath || str_starts_with($normalized, $guestPath.'/')) {
                return true;
            }
        }

        return false;
    }

    private static function isResolvableGetPath(string $path): bool
    {
        try {
            app('router')->getRoutes()->match(Request::create($path, 'GET'));

            return true;
        } catch (Throwable) {
            return false;
        }
    }
}
