<?php

use App\Http\Controllers\Collections\ContentCollectionController;
use App\Http\Controllers\Collections\FieldController;
use App\Http\Controllers\Collections\ItemController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::resource('collections', ContentCollectionController::class)->except([
        'create',
        'edit',
    ]);

    Route::put('collections/{collection}/singleton-content', [ContentCollectionController::class, 'upsertSingletonContent'])
        ->name('collections.singleton-content');

    Route::get('collections/{collection}/fields', [FieldController::class, 'index'])
        ->name('collections.fields.index');

    Route::get('collections/{collection}/items/new', [ItemController::class, 'newItem'])
        ->name('collections.items.new');

    Route::get('collections/{collection}/items/options', [ItemController::class, 'options'])
        ->name('collections.items.options');

    Route::resource('collections.items', ItemController::class)->except(['create', 'edit']);

    Route::post('collections/{collection}/fields', [FieldController::class, 'store'])->name('collections.fields.store');
    Route::patch('collections/{collection}/fields/{field}', [FieldController::class, 'update'])->name('collections.fields.update');
    Route::delete('collections/{collection}/fields/{field}', [FieldController::class, 'destroy'])->name('collections.fields.destroy');
    Route::post('collections/{collection}/fields/reorder', [FieldController::class, 'reorder'])->name('collections.fields.reorder');
});
