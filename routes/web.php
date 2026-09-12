<?php

/**
 * Application web routes: home redirect, authenticated shell, and domain route composition.
 *
 * Authenticated routes require `auth` and `verified`. Feature modules are loaded from sibling
 * route files (admin, settings, collections, ai).
 */

use App\Enums\PermissionEnum;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\NotificationController;
use App\Support\Auth\HomePath;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return auth()->check()
        ? redirect(HomePath::for(auth()->user()))
        : redirect()->route('login');
})->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowDashboard->value)
        ->name('dashboard');

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
