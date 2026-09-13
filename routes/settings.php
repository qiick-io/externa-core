<?php

/**
 * Account settings routes.
 *
 * Profile viewing and updates require only `auth`. Destructive or security-sensitive
 * actions (account deletion, password changes) additionally require `verified`.
 */

use App\Enums\PermissionEnum;
use App\Http\Controllers\Settings\AppearanceSettingsController;
use App\Http\Controllers\Settings\LocaleController;
use App\Http\Controllers\Settings\NotificationPreferencesController;
use App\Http\Controllers\Settings\PerformanceSettingsController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\ProjectSettingsController;
use App\Http\Controllers\Settings\SecurityController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::redirect('settings', '/settings/profile');

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::patch('settings/notification-preferences', [NotificationPreferencesController::class, 'update'])
        ->name('notification-preferences.update');
    Route::patch('settings/locale', [LocaleController::class, 'update'])->name('locale.update');
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('settings/security', [SecurityController::class, 'edit'])->name('security.edit');

    Route::put('settings/password', [SecurityController::class, 'update'])
        ->middleware('throttle:6,1')
        ->name('user-password.update');

    Route::get('settings/project', [ProjectSettingsController::class, 'edit'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('project.edit');

    Route::put('settings/project', [ProjectSettingsController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('project.update');

    Route::post('settings/project/webhook-test', [ProjectSettingsController::class, 'sendTestWebhook'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('project.webhook-test');

    Route::get('settings/appearance', [AppearanceSettingsController::class, 'edit'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('appearance.edit');

    Route::put('settings/appearance', [AppearanceSettingsController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('appearance.update');

    Route::get('settings/performance', [PerformanceSettingsController::class, 'edit'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('performance.edit');

    Route::post('settings/performance/flush-public-api', [PerformanceSettingsController::class, 'flushPublicApi'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('performance.flush-public-api');

    Route::post('settings/performance/flush-permission-matrices', [PerformanceSettingsController::class, 'flushPermissionMatrices'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('performance.flush-permission-matrices');

    Route::post('settings/performance/flush-spatie-permissions', [PerformanceSettingsController::class, 'flushSpatiePermissions'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('performance.flush-spatie-permissions');

    Route::post('settings/performance/flush-dashboard-metrics', [PerformanceSettingsController::class, 'flushDashboardMetrics'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('performance.flush-dashboard-metrics');
});
