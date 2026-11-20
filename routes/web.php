<?php

/**
 * Application web routes: home redirect, authenticated shell, and domain route composition.
 *
 * Authenticated routes require `auth` and `verified`. Feature modules are loaded from sibling
 * route files (admin, settings, collections, ai).
 */

use App\Enums\PermissionEnum;
use App\Http\Controllers\Auth\OidcCallbackController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\NotificationController;
use App\Services\Auth\HomePathService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Qiick\Oidc\Http\Controllers\BackChannelLogoutController;
use Qiick\Oidc\Http\Controllers\OidcRedirectController;

Route::get('/', function () {
    return auth()->check()
        ? redirect(HomePathService::for(auth()->user()))
        : redirect()->route('login');
})->name('home');

/*
 * qiick/laravel-oidc paths (package route registration is off so the callback can dual-read
 * users.oidc_sub for one release). Same URLs the IdP already has registered.
 */
Route::middleware(['guest', 'throttle:10,1'])->prefix('auth/oidc')->group(function (): void {
    Route::get('redirect', OidcRedirectController::class)->name('oidc.redirect');
    Route::get('callback', OidcCallbackController::class)->name('oidc.callback');
});

// IdP server-to-server POST: no CSRF (see bootstrap/app.php). No guest — the IdP has no session.
Route::post('auth/oidc/backchannel-logout', BackChannelLogoutController::class)
    ->name('oidc.backchannel-logout');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowDashboard->value)
        ->name('dashboard');
    // The dashboard's views after the overview, as their own URLs.
    Route::get('dashboard/{view}', [DashboardController::class, 'index'])
        ->whereIn('view', DashboardController::VIEWS)
        ->middleware('permission:'.PermissionEnum::CanShowDashboard->value)
        ->name('dashboard.view');

    Route::get('notifications', [NotificationController::class, 'index'])
        ->name('notifications.index');
    Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount'])
        ->name('notifications.unread-count');
    Route::post('notifications/read', [NotificationController::class, 'markRead'])
        ->name('notifications.read');
    Route::post('notifications/unread', [NotificationController::class, 'markUnread'])
        ->name('notifications.unread');

    // Same-origin stub for api_autocomplete QA (kitchen-sink City search).
    Route::get('demo/cities', function (Request $request) {
        $q = mb_strtolower(trim((string) $request->query('q', '')));
        $cities = [
            ['label' => 'Milan, Italy', 'value' => 'milan'],
            ['label' => 'Rome, Italy', 'value' => 'rome'],
            ['label' => 'Naples, Italy', 'value' => 'naples'],
            ['label' => 'Turin, Italy', 'value' => 'turin'],
            ['label' => 'Florence, Italy', 'value' => 'florence'],
            ['label' => 'Venice, Italy', 'value' => 'venice'],
            ['label' => 'Bologna, Italy', 'value' => 'bologna'],
            ['label' => 'Paris, France', 'value' => 'paris'],
            ['label' => 'Lyon, France', 'value' => 'lyon'],
            ['label' => 'Berlin, Germany', 'value' => 'berlin'],
            ['label' => 'Munich, Germany', 'value' => 'munich'],
            ['label' => 'Madrid, Spain', 'value' => 'madrid'],
            ['label' => 'Barcelona, Spain', 'value' => 'barcelona'],
            ['label' => 'London, United Kingdom', 'value' => 'london'],
            ['label' => 'New York, United States', 'value' => 'new_york'],
            ['label' => 'Tokyo, Japan', 'value' => 'tokyo'],
        ];

        $data = $q === ''
            ? []
            : array_values(array_filter(
                $cities,
                static fn (array $city): bool => str_contains(mb_strtolower($city['label']), $q)
                    || str_contains($city['value'], $q),
            ));

        return response()->json(['data' => $data]);
    })->name('demo.cities');
});

require __DIR__.'/admin.php';
require __DIR__.'/settings.php';
require __DIR__.'/collections.php';
require __DIR__.'/ai.php';
require __DIR__.'/chat.php';
