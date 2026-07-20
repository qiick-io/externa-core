<?php

use App\Http\Controllers\Api\V1\CollectionController;
use App\Http\Controllers\Api\V1\CollectionItemController;
use App\Http\Middleware\ResolveApiAccess;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')
    ->middleware(['throttle:api', ResolveApiAccess::class])
    ->group(function (): void {
        Route::get('collections', [CollectionController::class, 'index']);
        Route::get('collections/{slug}', [CollectionController::class, 'show']);

        Route::get('collections/{slug}/items', [CollectionItemController::class, 'index']);
        Route::post('collections/{slug}/items', [CollectionItemController::class, 'store']);
        Route::get('collections/{slug}/items/{item}', [CollectionItemController::class, 'show']);
        Route::patch('collections/{slug}/items/{item}', [CollectionItemController::class, 'update']);
        Route::delete('collections/{slug}/items/{item}', [CollectionItemController::class, 'destroy']);
    });
