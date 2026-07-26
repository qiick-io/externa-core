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
});

require __DIR__.'/admin.php';
require __DIR__.'/settings.php';
require __DIR__.'/collections.php';
require __DIR__.'/ai.php';
