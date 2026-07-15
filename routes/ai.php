<?php

use App\Enums\PermissionEnum;
use App\Http\Controllers\Ai\AiChatController;
use App\Http\Controllers\Ai\AiConversationController;
use App\Http\Controllers\Ai\AiPageController;
use App\Http\Controllers\Ai\AiStatusController;
use Illuminate\Support\Facades\Route;

Route::middleware([
    'auth',
    'verified',
    'permission:'.PermissionEnum::CanUseAi->value,
])->prefix('ai')->name('ai.')->group(function (): void {
    Route::get('/', [AiPageController::class, 'index'])->name('index');
    Route::get('/status', AiStatusController::class)->name('status');

    Route::get('/conversations', [AiConversationController::class, 'index'])->name('conversations.index');
    Route::post('/conversations', [AiConversationController::class, 'store'])->name('conversations.store');
    Route::post('/conversations/bulk-destroy', [AiConversationController::class, 'bulkDestroy'])
        ->name('conversations.bulk-destroy');
    Route::get('/conversations/{conversation}', [AiConversationController::class, 'show'])->name('conversations.show');
    Route::delete('/conversations/{conversation}', [AiConversationController::class, 'destroy'])->name('conversations.destroy');
    Route::post('/conversations/{conversation}/pin', [AiConversationController::class, 'togglePin'])
        ->name('conversations.pin');
    Route::post('/conversations/{conversation}/truncate', [AiConversationController::class, 'truncate'])
        ->name('conversations.truncate');

    Route::post('/chat', AiChatController::class)
        ->middleware('throttle:30,1')
        ->name('chat');

    // UUID show route after static `/ai/*` paths so they are not captured as conversations.
    Route::get('/{conversation}', [AiPageController::class, 'show'])
        ->whereUuid('conversation')
        ->name('show');
});
