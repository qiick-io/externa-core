<?php

/**
 * Global chat hub: Inertia pages plus JSON thread/message APIs.
 *
 * Authenticated routes require `auth`, `verified`, and `CanShowChat`.
 * Item-form aliases in collections.php stay on collection read ACL.
 */

use App\Enums\PermissionEnum;
use App\Http\Controllers\Chat\ChatAttachmentController;
use App\Http\Controllers\Chat\ChatAttachmentTransferController;
use App\Http\Controllers\Chat\ChatAttachmentUploadController;
use App\Http\Controllers\Chat\ChatDirectThreadController;
use App\Http\Controllers\Chat\ChatHubController;
use App\Http\Controllers\Chat\ChatItemOptionController;
use App\Http\Controllers\Chat\ChatMessageController;
use App\Http\Controllers\Chat\ChatMessageReactionController;
use App\Http\Controllers\Chat\ChatPageController;
use App\Http\Controllers\Chat\ChatRecipientOptionController;
use App\Http\Controllers\Chat\ChatThreadActivityController;
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
    Route::get('/options/users', [ChatRecipientOptionController::class, 'users'])->name('options.users');
    Route::get('/options/groups', [ChatRecipientOptionController::class, 'groups'])->name('options.groups');
    Route::get('/options/directory', [ChatRecipientOptionController::class, 'directory'])->name('options.directory');
    Route::get('/options/collections', [ChatItemOptionController::class, 'collections'])->name('options.collections');
    Route::get('/options/items', [ChatItemOptionController::class, 'items'])->name('options.items');
    Route::get('/options/item-picker', [ChatItemOptionController::class, 'itemPicker'])->name('options.item-picker');

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
    Route::post('/{chat}/messages/{message}/reactions', [ChatMessageReactionController::class, 'react'])
        ->whereUuid('chat')
        ->name('messages.react');
    Route::get('/{chat}/mentions', [ChatThreadActivityController::class, 'mentions'])
        ->whereUuid('chat')
        ->name('mentions');
    Route::put('/{chat}/notify', [ChatThreadActivityController::class, 'updateNotify'])
        ->whereUuid('chat')
        ->name('notify');
    Route::post('/{chat}/read', [ChatThreadActivityController::class, 'markRead'])
        ->whereUuid('chat')
        ->name('read');
    Route::post('/{chat}/stop-viewing', [ChatThreadActivityController::class, 'stopViewing'])
        ->whereUuid('chat')
        ->name('stop-viewing');
    Route::post('/{chat}/attachments', [ChatAttachmentController::class, 'storeAttachmentOnChat'])
        ->whereUuid('chat')
        ->name('attachments.store');
    Route::post('/{chat}/attachments/uploads/init', [ChatAttachmentUploadController::class, 'initAttachmentUploadOnChat'])
        ->whereUuid('chat')
        ->name('attachments.uploads.init');
    Route::post('/{chat}/attachments/uploads/chunk', [ChatAttachmentUploadController::class, 'uploadAttachmentChunkOnChat'])
        ->whereUuid('chat')
        ->name('attachments.uploads.chunk');
    Route::post('/{chat}/attachments/uploads/complete', [ChatAttachmentUploadController::class, 'completeAttachmentUploadOnChat'])
        ->whereUuid('chat')
        ->name('attachments.uploads.complete');
    Route::get('/{chat}/attachments/uploads/status', [ChatAttachmentUploadController::class, 'attachmentUploadStatusOnChat'])
        ->whereUuid('chat')
        ->name('attachments.uploads.status');
    Route::get('/{chat}/attachments/{attachment}', [ChatAttachmentController::class, 'showAttachmentOnChat'])
        ->whereUuid('chat')
        ->name('attachments.show');
    Route::get('/{chat}/attachments/{attachment}/preview', [ChatAttachmentController::class, 'showAttachmentPreviewOnChat'])
        ->whereUuid('chat')
        ->name('attachments.preview');
    Route::delete('/{chat}/attachments/{attachment}', [ChatAttachmentController::class, 'destroyAttachmentOnChat'])
        ->whereUuid('chat')
        ->name('attachments.destroy');
    Route::post('/{chat}/attachments/{attachment}/save-to-files', [ChatAttachmentTransferController::class, 'saveToFilesOnChat'])
        ->whereUuid('chat')
        ->name('attachments.save-to-files');
    Route::post('/{chat}/attachments/{attachment}/add-to-field', [ChatAttachmentTransferController::class, 'addToField'])
        ->whereUuid('chat')
        ->name('attachments.add-to-field');

    Route::post('/{chat}/participants', [ChatDirectThreadController::class, 'addParticipants'])
        ->whereUuid('chat')
        ->name('participants.store');
    Route::post('/{chat}/archive', [ChatDirectThreadController::class, 'archive'])
        ->whereUuid('chat')
        ->name('archive');
    Route::post('/{chat}/unarchive', [ChatDirectThreadController::class, 'unarchive'])
        ->whereUuid('chat')
        ->name('unarchive');
    Route::delete('/{chat}', [ChatDirectThreadController::class, 'destroy'])
        ->whereUuid('chat')
        ->name('destroy');

    Route::get('/{chat}', [ChatPageController::class, 'show'])
        ->whereUuid('chat')
        ->name('show');
});
