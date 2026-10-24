<?php

/**
 * Account settings routes.
 *
 * Profile viewing and updates require only `auth`. Destructive or security-sensitive
 * actions (account deletion, password changes) additionally require `verified`.
 */

use App\Enums\PermissionEnum;
use App\Http\Controllers\Settings\AppearanceSettingsController;
use App\Http\Controllers\Settings\AppearanceSidebarSettingsController;
use App\Http\Controllers\Settings\LocaleController;
use App\Http\Controllers\Settings\NotificationPreferencesController;
use App\Http\Controllers\Settings\PerformanceSettingsController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\ProjectApiSettingsController;
use App\Http\Controllers\Settings\ProjectContentSettingsController;
use App\Http\Controllers\Settings\ProjectFilesSettingsController;
use App\Http\Controllers\Settings\ProjectIntegrationsSettingsController;
use App\Http\Controllers\Settings\ProjectLocalizationSettingsController;
use App\Http\Controllers\Settings\ProjectSecuritySettingsController;
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

    $canManageProject = 'permission:'.PermissionEnum::CanManageProjectSettings->value;

    Route::get('settings/project', [ProjectSettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('project.edit');

    Route::put('settings/project', [ProjectSettingsController::class, 'update'])
        ->middleware($canManageProject)
        ->name('project.update');

    Route::get('settings/project/localization', [ProjectLocalizationSettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('project.localization.edit');

    Route::put('settings/project/localization', [ProjectLocalizationSettingsController::class, 'update'])
        ->middleware($canManageProject)
        ->name('project.localization.update');

    Route::get('settings/project/security', [ProjectSecuritySettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('project.security.edit');

    Route::put('settings/project/security', [ProjectSecuritySettingsController::class, 'update'])
        ->middleware($canManageProject)
        ->name('project.security.update');

    Route::get('settings/project/content', [ProjectContentSettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('project.content.edit');

    Route::put('settings/project/content', [ProjectContentSettingsController::class, 'update'])
        ->middleware($canManageProject)
        ->name('project.content.update');

    Route::get('settings/project/files', [ProjectFilesSettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('project.files.edit');

    Route::put('settings/project/files', [ProjectFilesSettingsController::class, 'update'])
        ->middleware($canManageProject)
        ->name('project.files.update');

    Route::get('settings/project/api', [ProjectApiSettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('project.api.edit');

    Route::put('settings/project/api', [ProjectApiSettingsController::class, 'update'])
        ->middleware($canManageProject)
        ->name('project.api.update');

    Route::get('settings/project/integrations', [ProjectIntegrationsSettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('project.integrations.edit');

    Route::put('settings/project/integrations', [ProjectIntegrationsSettingsController::class, 'update'])
        ->middleware($canManageProject)
        ->name('project.integrations.update');

    Route::post('settings/project/integrations/webhook-test', [ProjectIntegrationsSettingsController::class, 'sendTestWebhook'])
        ->middleware($canManageProject)
        ->name('project.integrations.webhook-test');

    Route::post('settings/project/integrations/slack-notifier-test', [ProjectIntegrationsSettingsController::class, 'sendTestSlackNotifier'])
        ->middleware($canManageProject)
        ->name('project.integrations.slack-notifier-test');

    Route::post('settings/project/integrations/telegram-notifier-test', [ProjectIntegrationsSettingsController::class, 'sendTestTelegramNotifier'])
        ->middleware($canManageProject)
        ->name('project.integrations.telegram-notifier-test');

    // Deprecated aliases (one minor): keep old test URLs working.
    Route::post('settings/project/webhook-test', [ProjectIntegrationsSettingsController::class, 'sendTestWebhook'])
        ->middleware($canManageProject)
        ->name('project.webhook-test');

    Route::post('settings/project/slack-notifier-test', [ProjectIntegrationsSettingsController::class, 'sendTestSlackNotifier'])
        ->middleware($canManageProject)
        ->name('project.slack-notifier-test');

    Route::post('settings/project/telegram-notifier-test', [ProjectIntegrationsSettingsController::class, 'sendTestTelegramNotifier'])
        ->middleware($canManageProject)
        ->name('project.telegram-notifier-test');

    Route::get('settings/appearance', [AppearanceSettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('appearance.edit');

    Route::put('settings/appearance', [AppearanceSettingsController::class, 'update'])
        ->middleware($canManageProject)
        ->name('appearance.update');

    Route::get('settings/appearance/sidebar', [AppearanceSidebarSettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('appearance.sidebar.edit');

    Route::put('settings/appearance/sidebar', [AppearanceSidebarSettingsController::class, 'update'])
        ->middleware($canManageProject)
        ->name('appearance.sidebar.update');

    Route::get('settings/performance', [PerformanceSettingsController::class, 'edit'])
        ->middleware($canManageProject)
        ->name('performance.edit');

    Route::post('settings/performance/flush-public-api', [PerformanceSettingsController::class, 'flushPublicApi'])
        ->middleware($canManageProject)
        ->name('performance.flush-public-api');

    Route::post('settings/performance/flush-permission-matrices', [PerformanceSettingsController::class, 'flushPermissionMatrices'])
        ->middleware($canManageProject)
        ->name('performance.flush-permission-matrices');

    Route::post('settings/performance/flush-spatie-permissions', [PerformanceSettingsController::class, 'flushSpatiePermissions'])
        ->middleware($canManageProject)
        ->name('performance.flush-spatie-permissions');

    Route::post('settings/performance/flush-dashboard-metrics', [PerformanceSettingsController::class, 'flushDashboardMetrics'])
        ->middleware($canManageProject)
        ->name('performance.flush-dashboard-metrics');
});
