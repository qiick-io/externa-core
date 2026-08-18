<?php

/**
 * Global chat hub: Inertia pages plus JSON thread/message APIs.
 *
 * Authenticated routes require `auth`, `verified`, and `CanShowChat`.
 * Item-form aliases in collections.php stay on collection read ACL.
 */

use App\Enums\PermissionEnum;
use App\Http\Controllers\Chat\ChatHubController;
use App\Http\Controllers\Chat\ChatMessageController;
use App\Http\Controllers\Chat\ChatPageController;
use Illuminate\Support\Facades\Route;

Route::middleware([
    'auth',
    'verified',
    'permission:'.PermissionEnum::CanShowChat->value,
])->prefix('chat')->name('chat.')->group(function (): void {
    Route::get('/', [ChatPageController::class, 'index'])->name('index');

    Route::get('/threads', [ChatHubController::class, 'threads'])->name('threads.index');
    Route::post('/threads', [ChatHubController::class, 'store'])->name('threads.store');
    Route::get('/unread-count', [ChatHubController::class, 'unread'])->name('unread-count');
    Route::get('/options/users', [ChatHubController::class, 'users'])->name('options.users');
    Route::get('/options/groups', [ChatHubController::class, 'groups'])->name('options.groups');
    Route::get('/options/directory', [ChatHubController::class, 'directory'])->name('options.directory');
    Route::get('/options/collections', [ChatHubController::class, 'collections'])->name('options.collections');
    Route::get('/options/items', [ChatHubController::class, 'items'])->name('options.items');
    Route::get('/options/item-picker', [ChatHubController::class, 'itemPicker'])->name('options.item-picker');

    Route::get('/{chat}/messages', [ChatMessageController::class, 'index'])
        ->whereUuid('chat')
        ->name('messages.index');
    Route::post('/{chat}/messages', [ChatMessageController::class, 'store'])
        ->whereUuid('chat')
        ->name('messages.store');
    Route::patch('/{chat}/messages/{message}', [ChatMessageController::class, 'update'])
        ->whereUuid('chat')
        ->name('messages.update');
    Route::delete('/{chat}/messages/{message}', [ChatMessageController::class, 'destroy'])
        ->whereUuid('chat')
        ->name('messages.destroy');
    Route::put('/{chat}/messages/{message}/pin', [ChatMessageController::class, 'pin'])
        ->whereUuid('chat')
        ->name('messages.pin');
    Route::post('/{chat}/messages/{message}/reactions', [ChatMessageController::class, 'react'])
        ->whereUuid('chat')
        ->name('messages.react');
    Route::post('/{chat}/messages/{message}/forward', [ChatMessageController::class, 'forward'])
        ->whereUuid('chat')
        ->name('messages.forward');
    Route::get('/{chat}/mentions', [ChatMessageController::class, 'mentions'])
        ->whereUuid('chat')
        ->name('mentions');
    Route::put('/{chat}/notify', [ChatMessageController::class, 'updateNotify'])
        ->whereUuid('chat')
        ->name('notify');
    Route::post('/{chat}/read', [ChatHubController::class, 'markRead'])
        ->whereUuid('chat')
        ->name('read');
    Route::post('/{chat}/attachments', [ChatMessageController::class, 'storeAttachmentOnChat'])
        ->whereUuid('chat')
        ->name('attachments.store');
    Route::get('/{chat}/attachments/{attachment}', [ChatMessageController::class, 'showAttachmentOnChat'])
        ->whereUuid('chat')
        ->name('attachments.show');
    Route::post('/{chat}/attachments/{attachment}/save-to-files', [ChatMessageController::class, 'saveToFilesOnChat'])
        ->whereUuid('chat')
        ->name('attachments.save-to-files');
    Route::post('/{chat}/attachments/{attachment}/add-to-field', [ChatMessageController::class, 'addToField'])
        ->whereUuid('chat')
        ->name('attachments.add-to-field');

    Route::get('/{chat}', [ChatPageController::class, 'show'])
        ->whereUuid('chat')
        ->name('show');
});
