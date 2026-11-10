<?php

/**
 * AI assistant routes: webhook ingestion, chat UI, conversations, attachments, and imports.
 *
 * Authenticated routes require `auth`, `verified`, and `CanUseAi`. Chat and attachment
 * endpoints are rate-limited; import job status additionally requires `CanCreateCollections`.
 */

use App\Enums\PermissionEnum;
use App\Http\Controllers\Ai\AiChatAttachmentController;
use App\Http\Controllers\Ai\AiChatController;
use App\Http\Controllers\Ai\AiContextSearchController;
use App\Http\Controllers\Ai\AiConversationController;
use App\Http\Controllers\Ai\AiPageController;
use App\Http\Controllers\Ai\AiPromptController;
use App\Http\Controllers\Ai\AiStatusController;
use App\Http\Controllers\Ai\AiTranslateFieldsController;
use App\Http\Controllers\Ai\CollectionImportWebhookController;
use App\Http\Controllers\Ai\ImportJobStatusController;
use Illuminate\Support\Facades\Route;

Route::post('/ai/webhooks/collection-import', CollectionImportWebhookController::class)
    ->middleware('throttle:30,1')
    ->name('ai.webhooks.collection-import');

Route::middleware([
    'auth',
    'verified',
    'permission:'.PermissionEnum::CanUseAi->value,
])->prefix('ai')->name('ai.')->group(function (): void {
    Route::get('/', [AiPageController::class, 'index'])->name('index');
    Route::get('/status', AiStatusController::class)->name('status');
    Route::post('/translate-fields', AiTranslateFieldsController::class)
        ->middleware('throttle:20,1')
        ->name('translate-fields');

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

    Route::post('/attachments', [AiChatAttachmentController::class, 'store'])
        ->middleware('throttle:30,1')
        ->name('attachments.store');

    Route::get('/context/collections', [AiContextSearchController::class, 'collections'])
        ->middleware('throttle:60,1')
        ->name('context.collections');
    Route::get('/context/items', [AiContextSearchController::class, 'items'])
        ->middleware('throttle:60,1')
        ->name('context.items');
    Route::get('/context/files', [AiContextSearchController::class, 'files'])
        ->middleware('throttle:60,1')
        ->name('context.files');

    Route::get('/prompts', [AiPromptController::class, 'index'])
        ->middleware('throttle:60,1')
        ->name('prompts.index');
    Route::post('/prompts', [AiPromptController::class, 'store'])
        ->middleware('throttle:30,1')
        ->name('prompts.store');
    Route::put('/prompts/{prompt}', [AiPromptController::class, 'update'])
        ->middleware('throttle:30,1')
        ->name('prompts.update');
    Route::delete('/prompts/{prompt}', [AiPromptController::class, 'destroy'])
        ->middleware('throttle:30,1')
        ->name('prompts.destroy');

    Route::post('/chat', AiChatController::class)
        ->middleware('throttle:30,1')
        ->name('chat');

    Route::get('/import-jobs/{jobId}', ImportJobStatusController::class)
        ->middleware('permission:'.PermissionEnum::CanCreateCollections->value)
        ->whereUuid('jobId')
        ->name('import-jobs.show');

    /*
     * Conversation deep-link. Registered last so static `/ai/*` paths are not captured
     * as `{conversation}` UUIDs.
     */
    Route::get('/{conversation}', [AiPageController::class, 'show'])
        ->whereUuid('conversation')
        ->name('show');
});
