<?php

use App\Http\Controllers\Cms\ContentCollectionController;
use App\Http\Controllers\Cms\FieldController;
use App\Http\Controllers\Cms\ItemController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->prefix('cms')->name('cms.')->group(function () {
    Route::resource('collections', ContentCollectionController::class)->except([
        'create',
        'edit',
    ]);

    Route::put('collections/{collection}/singleton-content', [ContentCollectionController::class, 'upsertSingletonContent'])
        ->name('collections.singleton-content');

    Route::resource('collections.items', ItemController::class);

    Route::post('collections/{collection}/fields', [FieldController::class, 'store'])->name('collections.fields.store');
    Route::patch('collections/{collection}/fields/{field}', [FieldController::class, 'update'])->name('collections.fields.update');
    Route::delete('collections/{collection}/fields/{field}', [FieldController::class, 'destroy'])->name('collections.fields.destroy');
    Route::post('collections/{collection}/fields/reorder', [FieldController::class, 'reorder'])->name('collections.fields.reorder');
});
