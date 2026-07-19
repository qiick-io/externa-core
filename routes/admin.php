<?php

/**
 * Admin routes for users, groups, roles, permissions, activity logs, and the file manager.
 *
 * All routes require `auth` and `verified`. Each action is gated by a Spatie `permission:*`
 * middleware alias except bulk actions that enforce authorization in the controller.
 */

use App\Enums\PermissionEnum;
use App\Http\Controllers\Admin\ActivityLogController;
use App\Http\Controllers\Admin\FileController;
use App\Http\Controllers\Admin\PermissionController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\UserGroupController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('users', [UserController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowUsers->value)
        ->name('users.index');

    Route::post('users', [UserController::class, 'store'])
        ->middleware('permission:'.PermissionEnum::CanCreateUsers->value)
        ->name('users.store');

    Route::put('users/{user}', [UserController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanEditUsers->value)
        ->name('users.update');

    Route::delete('users/{user}', [UserController::class, 'destroy'])
        ->middleware('permission:'.PermissionEnum::CanDeleteUsers->value)
        ->name('users.destroy');

    Route::post('users/{user}/restore', [UserController::class, 'restore'])
        ->middleware('permission:'.PermissionEnum::CanRestoreUsers->value)
        ->name('users.restore');

    Route::delete('users/{user}/force', [UserController::class, 'forceDelete'])
        ->middleware('permission:'.PermissionEnum::CanForceDeleteUsers->value)
        ->name('users.force-delete');

    Route::post('users/bulk-actions', [UserController::class, 'bulkActions'])
        ->name('users.bulk-actions');

    Route::get('groups', [UserGroupController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowGroups->value)
        ->name('groups.index');

    Route::post('groups', [UserGroupController::class, 'store'])
        ->middleware('permission:'.PermissionEnum::CanCreateGroups->value)
        ->name('groups.store');

    Route::put('groups/{group}', [UserGroupController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanEditGroups->value)
        ->name('groups.update');

    Route::delete('groups/{group}', [UserGroupController::class, 'destroy'])
        ->middleware('permission:'.PermissionEnum::CanDeleteGroups->value)
        ->name('groups.destroy');

    Route::delete('groups/bulk/destroy', [UserGroupController::class, 'bulkDestroy'])
        ->middleware('permission:'.PermissionEnum::CanDeleteGroups->value)
        ->name('groups.bulk-destroy');

    Route::get('roles', [RoleController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowRoles->value)
        ->name('roles.index');

    Route::get('roles/create', [RoleController::class, 'create'])
        ->middleware('permission:'.PermissionEnum::CanCreateRoles->value)
        ->name('roles.create');

    Route::post('roles', [RoleController::class, 'store'])
        ->middleware('permission:'.PermissionEnum::CanCreateRoles->value)
        ->name('roles.store');

    Route::get('roles/{role}/edit', [RoleController::class, 'edit'])
        ->middleware('permission:'.PermissionEnum::CanEditRoles->value)
        ->name('roles.edit');

    Route::put('roles/{role}', [RoleController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanEditRoles->value)
        ->name('roles.update');

    Route::delete('roles/{role}', [RoleController::class, 'destroy'])
        ->middleware('permission:'.PermissionEnum::CanDeleteRoles->value)
        ->name('roles.destroy');

    Route::post('roles/bulk-actions', [RoleController::class, 'bulkActions'])
        ->name('roles.bulk-actions');

    Route::get('permissions', [PermissionController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowPermissions->value)
        ->name('permissions.index');

    Route::post('permissions', [PermissionController::class, 'store'])
        ->middleware('permission:'.PermissionEnum::CanCreatePermissions->value)
        ->name('permissions.store');

    Route::put('permissions/{permission}', [PermissionController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanEditPermissions->value)
        ->name('permissions.update');

    Route::delete('permissions/{permission}', [PermissionController::class, 'destroy'])
        ->middleware('permission:'.PermissionEnum::CanDeletePermissions->value)
        ->name('permissions.destroy');

    Route::post('permissions/sync', [PermissionController::class, 'sync'])
        ->middleware('permission:'.PermissionEnum::CanEditPermissions->value)
        ->name('permissions.sync');

    Route::get('activity-logs', [ActivityLogController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowActivityLogs->value)
        ->name('activity-logs.index');

    /*
     * File manager API and UI. `can.manage.files` resolves effective file permissions
     * instead of a single enum gate. Static `/files/*` paths are registered before the
     * optional `{folder}` index route so reserved segments are not captured as folder IDs.
     */
    Route::middleware('can.manage.files')->group(function () {
        Route::prefix('files')->name('files.')->group(function () {
            Route::get('list', [FileController::class, 'list'])->name('list');
            Route::get('tags', [FileController::class, 'listTags'])->name('tags.index');
            Route::post('folders', [FileController::class, 'createFolder'])->name('folders.store');
            Route::post('upload', [FileController::class, 'upload'])->name('upload');
            Route::post('bulk', [FileController::class, 'bulk'])->name('bulk');
            Route::post('download', [FileController::class, 'downloadMany'])->name('download-many');
            Route::get('zips/{jobId}', [FileController::class, 'downloadPreparedZip'])->name('zips.download');
            Route::patch('{file}', [FileController::class, 'update'])->name('update');
            Route::post('{file}/replace', [FileController::class, 'replace'])->name('replace');
            Route::post('{file}/copy', [FileController::class, 'copy'])->name('copy');
            Route::post('{file}/favorite', [FileController::class, 'favorite'])->name('favorite');
            Route::delete('{file}/favorite', [FileController::class, 'unfavorite'])->name('unfavorite');
            Route::put('{file}/tags', [FileController::class, 'syncTags'])->name('tags');
            Route::get('{file}/download', [FileController::class, 'download'])->name('download');
            Route::get('{file}/thumbnail', [FileController::class, 'thumbnail'])->name('thumbnail');
            Route::patch('{file}/move', [FileController::class, 'move'])->name('move');
            Route::patch('{file}/rename', [FileController::class, 'rename'])->name('rename');
            Route::delete('{file}', [FileController::class, 'destroy'])->name('destroy');
            Route::post('{file}/restore', [FileController::class, 'restore'])->name('restore');
            Route::delete('{file}/force', [FileController::class, 'forceDelete'])->name('force-delete');
            Route::post('{file}/attach', [FileController::class, 'attach'])->name('attach');
            Route::post('{file}/detach', [FileController::class, 'detach'])->name('detach');

            Route::post('uploads/init', [FileController::class, 'initChunkUpload'])->name('uploads.init');
            Route::post('uploads/chunk', [FileController::class, 'uploadChunk'])->name('uploads.chunk');
            Route::post('uploads/complete', [FileController::class, 'completeChunkUpload'])->name('uploads.complete');
            Route::get('uploads/status', [FileController::class, 'uploadStatus'])->name('uploads.status');
        });

        Route::get('files/{folder?}', [FileController::class, 'index'])
            ->whereNumber('folder')
            ->name('files.index');
    });
});
