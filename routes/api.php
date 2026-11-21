<?php

use App\Enums\ApiKeyScopeEnum;
use App\Http\Controllers\Api\V1\CollectionController;
use App\Http\Controllers\Api\V1\CollectionItemBatchController;
use App\Http\Controllers\Api\V1\CollectionItemController;
use App\Http\Controllers\Api\V1\FileContentController;
use App\Http\Controllers\Api\V1\FileController;
use App\Http\Controllers\Api\V1\LivePreviewController;
use App\Http\Controllers\Api\V1\OpenApiController;
use App\Http\Middleware\ApiRequestCostMiddleware;
use App\Http\Middleware\EmitBigintUserIdDeprecationHeadersMiddleware;
use App\Http\Middleware\EnforcePublicApiOriginMiddleware;
use App\Http\Middleware\RequireApiKeyScopeMiddleware;
use App\Http\Middleware\ResolveApiAccessMiddleware;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')
    ->middleware(['throttle:api'])
    ->group(function (): void {
        // Machine-readable Public CMS API contract — no API key / origin gate.
        Route::get('openapi.json', OpenApiController::class);
    });

Route::prefix('v1')
    ->middleware(['throttle:api', EnforcePublicApiOriginMiddleware::class])
    ->group(function (): void {
        // Signed Live Preview token — no API key (token is the credential).
        Route::get('preview', LivePreviewController::class);
    });

Route::prefix('v1')
    ->middleware([
        'throttle:api',
        EnforcePublicApiOriginMiddleware::class,
        ResolveApiAccessMiddleware::class,
        ApiRequestCostMiddleware::class,
        EmitBigintUserIdDeprecationHeadersMiddleware::class,
    ])
    ->group(function (): void {
        $requiresScope = static fn (ApiKeyScopeEnum $scope): string => RequireApiKeyScopeMiddleware::class.':'.$scope->value;

        Route::middleware($requiresScope(ApiKeyScopeEnum::CollectionsRead))->group(function (): void {
            Route::get('collections', [CollectionController::class, 'index']);
            Route::get('collections/{slug}', [CollectionController::class, 'show']);
            Route::get('collections/{slug}/items', [CollectionItemController::class, 'index']);
            Route::get('collections/{slug}/items/{item}', [CollectionItemController::class, 'show']);
        });

        Route::middleware($requiresScope(ApiKeyScopeEnum::CollectionsWrite))->group(function (): void {
            Route::post('collections/{slug}/items', [CollectionItemController::class, 'store']);
            Route::post('collections/{slug}/items/batch', [CollectionItemBatchController::class, 'batchStore']);
            Route::patch('collections/{slug}/items/batch', [CollectionItemBatchController::class, 'batchUpdate']);
            Route::delete('collections/{slug}/items/batch', [CollectionItemBatchController::class, 'batchDestroy']);
            Route::patch('collections/{slug}/items/{item}', [CollectionItemController::class, 'update']);
            Route::delete('collections/{slug}/items/{item}', [CollectionItemController::class, 'destroy']);
        });

        Route::middleware($requiresScope(ApiKeyScopeEnum::FilesRead))->group(function (): void {
            Route::get('files', [FileController::class, 'index']);
            Route::get('files/{id}', [FileController::class, 'show'])->whereNumber('id');
            Route::get('files/{id}/content', [FileContentController::class, 'content'])->whereNumber('id');
            Route::get('files/{id}/transforms/{key}', [FileContentController::class, 'transform'])
                ->whereNumber('id')
                ->where('key', '[A-Za-z0-9_-]+');
        });

        Route::middleware($requiresScope(ApiKeyScopeEnum::FilesWrite))->group(function (): void {
            Route::post('files', [FileController::class, 'store']);
            Route::patch('files/{id}', [FileController::class, 'update'])->whereNumber('id');
            Route::delete('files/{id}', [FileController::class, 'destroy'])->whereNumber('id');
        });
    });
