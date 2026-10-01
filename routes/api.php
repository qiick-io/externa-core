<?php

use App\Http\Controllers\Api\V1\CollectionController;
use App\Http\Controllers\Api\V1\CollectionItemController;
use App\Http\Controllers\Api\V1\FileController;
use App\Http\Controllers\Api\V1\LivePreviewController;
use App\Http\Controllers\Api\V1\OpenApiController;
use App\Http\Middleware\EnforcePublicApiOrigin;
use App\Http\Middleware\ResolveApiAccess;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')
    ->middleware(['throttle:api'])
    ->group(function (): void {
        // Machine-readable Public CMS API contract — no API key / origin gate.
        Route::get('openapi.json', OpenApiController::class);
    });

Route::prefix('v1')
    ->middleware(['throttle:api', EnforcePublicApiOrigin::class])
    ->group(function (): void {
        // Signed Live Preview token — no API key (token is the credential).
        Route::get('preview', LivePreviewController::class);
    });

Route::prefix('v1')
    ->middleware(['throttle:api', EnforcePublicApiOrigin::class, ResolveApiAccess::class])
    ->group(function (): void {
        Route::get('collections', [CollectionController::class, 'index']);
        Route::get('collections/{slug}', [CollectionController::class, 'show']);

        Route::get('collections/{slug}/items', [CollectionItemController::class, 'index']);
        Route::post('collections/{slug}/items', [CollectionItemController::class, 'store']);
        Route::get('collections/{slug}/items/{item}', [CollectionItemController::class, 'show']);
        Route::patch('collections/{slug}/items/{item}', [CollectionItemController::class, 'update']);
        Route::delete('collections/{slug}/items/{item}', [CollectionItemController::class, 'destroy']);

        Route::get('files', [FileController::class, 'index']);
        Route::post('files', [FileController::class, 'store']);
        Route::get('files/{id}', [FileController::class, 'show'])->whereNumber('id');
        Route::patch('files/{id}', [FileController::class, 'update'])->whereNumber('id');
        Route::delete('files/{id}', [FileController::class, 'destroy'])->whereNumber('id');
        Route::get('files/{id}/content', [FileController::class, 'content'])->whereNumber('id');
        Route::get('files/{id}/transforms/{key}', [FileController::class, 'transform'])
            ->whereNumber('id')
            ->where('key', '[A-Za-z0-9_-]+');
    });
