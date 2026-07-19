<?php

/**
 * Content collection routes: collection CRUD, field schema, and item management.
 *
 * All routes require `auth` and `verified`. Soft-delete restore/force-delete and singleton
 * content upsert are registered alongside the resource controllers.
 */

use App\Http\Controllers\Collections\ContentCollectionController;
use App\Http\Controllers\Collections\FieldController;
use App\Http\Controllers\Collections\ItemController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('collections', ContentCollectionController::class)->except([
        'create',
        'edit',
    ]);

    Route::post('collections/{collection}/restore', [ContentCollectionController::class, 'restore'])
        ->name('collections.restore');
    Route::delete('collections/{collection}/force', [ContentCollectionController::class, 'forceDelete'])
        ->name('collections.force-delete');

    Route::put('collections/{collection}/singleton-content', [ContentCollectionController::class, 'upsertSingletonContent'])
        ->name('collections.singleton-content');

    Route::get('collections/{collection}/fields', [FieldController::class, 'index'])
        ->name('collections.fields.index');

    Route::get('collections/{collection}/items/new', [ItemController::class, 'newItem'])
        ->name('collections.items.new');

    Route::get('collections/{collection}/items/options', [ItemController::class, 'fieldOptions'])
        ->name('collections.items.field-options');

    Route::post('collections/{collection}/items/{item}/restore', [ItemController::class, 'restore'])
        ->name('collections.items.restore');
    Route::delete('collections/{collection}/items/{item}/force', [ItemController::class, 'forceDelete'])
        ->name('collections.items.force-delete');

    Route::resource('collections.items', ItemController::class)->except(['create', 'edit']);

    Route::post('collections/{collection}/fields', [FieldController::class, 'store'])->name('collections.fields.store');
    Route::patch('collections/{collection}/fields/{field}', [FieldController::class, 'update'])->name('collections.fields.update');
    Route::delete('collections/{collection}/fields/{field}', [FieldController::class, 'destroy'])->name('collections.fields.destroy');
    Route::post('collections/{collection}/fields/reorder', [FieldController::class, 'reorder'])->name('collections.fields.reorder');
    Route::post('collections/{collection}/fields/{field}/duplicate', [FieldController::class, 'duplicate'])->name('collections.fields.duplicate');
    Route::post('collections/{collection}/fields/{field}/toggle-form-visibility', [FieldController::class, 'toggleFormVisibility'])->name('collections.fields.toggle-form-visibility');
    Route::post('collections/{collection}/fields/{field}/layout-width', [FieldController::class, 'updateLayoutWidth'])->name('collections.fields.update-layout-width');
});
