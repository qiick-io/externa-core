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
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\ProjectSettingsController;
use App\Http\Controllers\Settings\SecurityController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::redirect('settings', '/settings/profile');

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');
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

    Route::get('settings/appearance', [AppearanceSettingsController::class, 'edit'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('appearance.edit');

    Route::put('settings/appearance', [AppearanceSettingsController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanManageProjectSettings->value)
        ->name('appearance.update');
});
