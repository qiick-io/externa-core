<?php

/**
 * Content collection routes: collection CRUD, field schema, and item management.
 *
 * All routes require `auth` and `verified`. Each action is gated by a Spatie
 * `permission:*` middleware alias (super-admin bypasses via Gate::before).
 */

use App\Enums\PermissionEnum;
use App\Http\Controllers\Collections\ContentCollectionController;
use App\Http\Controllers\Collections\FieldController;
use App\Http\Controllers\Collections\ItemChatController;
use App\Http\Controllers\Collections\ItemController;
use App\Http\Controllers\Collections\ItemRevisionController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('collections', [ContentCollectionController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.index');

    Route::post('collections', [ContentCollectionController::class, 'store'])
        ->middleware('permission:'.PermissionEnum::CanCreateCollections->value)
        ->name('collections.store');

    Route::post('collections/bulk', [ContentCollectionController::class, 'bulk'])
        ->name('collections.bulk');

    Route::post('collections/packs/{pack}', [ContentCollectionController::class, 'applyPack'])
        ->middleware('permission:'.PermissionEnum::CanCreateCollections->value)
        ->name('collections.packs.apply');

    Route::get('collections/slug-available', [ContentCollectionController::class, 'checkSlug'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.slug-available');

    Route::get('collections/{collection}', [ContentCollectionController::class, 'show'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.show');

    Route::put('collections/{collection}', [ContentCollectionController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.update');

    Route::delete('collections/{collection}', [ContentCollectionController::class, 'destroy'])
        ->middleware('permission:'.PermissionEnum::CanDeleteCollections->value)
        ->name('collections.destroy');

    Route::post('collections/{collection}/restore', [ContentCollectionController::class, 'restore'])
        ->middleware('permission:'.PermissionEnum::CanRestoreCollections->value)
        ->name('collections.restore');

    Route::delete('collections/{collection}/force', [ContentCollectionController::class, 'forceDelete'])
        ->middleware('permission:'.PermissionEnum::CanForceDeleteCollections->value)
        ->name('collections.force-delete');

    Route::put('collections/{collection}/singleton-content', [ContentCollectionController::class, 'upsertSingletonContent'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.singleton-content');

    Route::get('collections/{collection}/fields', [FieldController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.fields.index');

    Route::get('collections/{collection}/items/new', [ItemController::class, 'newItem'])
        ->middleware('permission:'.PermissionEnum::CanCreateCollections->value)
        ->name('collections.items.new');

    Route::get('collections/{collection}/items/options', [ItemController::class, 'fieldOptions'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.field-options');

    Route::get('collections/{collection}/items/{item}/revisions', [ItemRevisionController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.revisions.index');

    Route::post('collections/{collection}/items/{item}/revisions/{revision}/restore', [ItemRevisionController::class, 'restore'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.items.revisions.restore');

    Route::get('collections/{collection}/items/{item}/chat/mentions', [ItemChatController::class, 'mentions'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.mentions');

    Route::put('collections/{collection}/items/{item}/chat/notify', [ItemChatController::class, 'updateNotify'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.notify');

    Route::post('collections/{collection}/items/{item}/chat/read', [ItemChatController::class, 'markRead'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.read');

    Route::post('collections/{collection}/items/{item}/chat/stop-viewing', [ItemChatController::class, 'stopViewing'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.stop-viewing');

    Route::post('collections/{collection}/items/{item}/chat/attachments', [ItemChatController::class, 'storeAttachment'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.attachments.store');

    Route::post('collections/{collection}/items/{item}/chat/attachments/uploads/init', [ItemChatController::class, 'initAttachmentUpload'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.attachments.uploads.init');

    Route::post('collections/{collection}/items/{item}/chat/attachments/uploads/chunk', [ItemChatController::class, 'uploadAttachmentChunk'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.attachments.uploads.chunk');

    Route::post('collections/{collection}/items/{item}/chat/attachments/uploads/complete', [ItemChatController::class, 'completeAttachmentUpload'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.attachments.uploads.complete');

    Route::get('collections/{collection}/items/{item}/chat/attachments/uploads/status', [ItemChatController::class, 'attachmentUploadStatus'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.attachments.uploads.status');

    Route::get('collections/{collection}/items/{item}/chat/attachments/{attachment}', [ItemChatController::class, 'showAttachment'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.attachments.show');

    Route::get('collections/{collection}/items/{item}/chat/attachments/{attachment}/preview', [ItemChatController::class, 'showAttachmentPreview'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.attachments.preview');

    Route::delete('collections/{collection}/items/{item}/chat/attachments/{attachment}', [ItemChatController::class, 'destroyAttachment'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.attachments.destroy');

    Route::post('collections/{collection}/items/{item}/chat/attachments/{attachment}/save-to-files', [ItemChatController::class, 'saveToFiles'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.attachments.save-to-files');

    Route::post('collections/{collection}/items/{item}/chat/attachments/{attachment}/add-to-field', [ItemChatController::class, 'addToField'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.items.chat.attachments.add-to-field');

    Route::get('collections/{collection}/items/{item}/chat', [ItemChatController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.index');

    Route::post('collections/{collection}/items/{item}/chat', [ItemChatController::class, 'store'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.store');

    Route::patch('collections/{collection}/items/{item}/chat/{message}', [ItemChatController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.update');

    Route::delete('collections/{collection}/items/{item}/chat/{message}', [ItemChatController::class, 'destroy'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.destroy');

    Route::put('collections/{collection}/items/{item}/chat/{message}/pin', [ItemChatController::class, 'pin'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.pin');

    Route::post('collections/{collection}/items/{item}/chat/{message}/reactions', [ItemChatController::class, 'react'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.chat.react');

    Route::post('collections/{collection}/items/{item}/publish', [ItemController::class, 'publish'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.items.publish');

    Route::get('collections/{collection}/items/{item}/preview-as-role', [ItemController::class, 'previewAsRole'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.preview-as-role');

    Route::put('collections/{collection}/list-columns', [ItemController::class, 'updateListColumns'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.items.list-columns.update');

    Route::get('collections/{collection}/items/export', [ItemController::class, 'export'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.export');

    Route::get('collections/{collection}/items', [ItemController::class, 'index'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.index');

    Route::post('collections/{collection}/items', [ItemController::class, 'store'])
        ->middleware('permission:'.PermissionEnum::CanCreateCollections->value)
        ->name('collections.items.store');

    Route::post('collections/{collection}/items/bulk', [ItemController::class, 'bulk'])
        ->name('collections.items.bulk');

    Route::get('collections/{collection}/items/{item}', [ItemController::class, 'show'])
        ->middleware('permission:'.PermissionEnum::CanShowCollections->value)
        ->name('collections.items.show');

    Route::put('collections/{collection}/items/{item}', [ItemController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.items.update');

    Route::delete('collections/{collection}/items/{item}', [ItemController::class, 'destroy'])
        ->middleware('permission:'.PermissionEnum::CanDeleteCollections->value)
        ->name('collections.items.destroy');

    Route::post('collections/{collection}/items/{item}/restore', [ItemController::class, 'restore'])
        ->middleware('permission:'.PermissionEnum::CanRestoreCollections->value)
        ->name('collections.items.restore');

    Route::delete('collections/{collection}/items/{item}/force', [ItemController::class, 'forceDelete'])
        ->middleware('permission:'.PermissionEnum::CanForceDeleteCollections->value)
        ->name('collections.items.force-delete');

    Route::post('collections/{collection}/field-packs/{pack}', [FieldController::class, 'applyPack'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.field-packs.apply');

    Route::post('collections/{collection}/fields', [FieldController::class, 'store'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.fields.store');

    Route::patch('collections/{collection}/fields/{field}', [FieldController::class, 'update'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.fields.update');

    Route::delete('collections/{collection}/fields/{field}', [FieldController::class, 'destroy'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.fields.destroy');

    Route::post('collections/{collection}/fields/reorder', [FieldController::class, 'reorder'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.fields.reorder');

    Route::post('collections/{collection}/fields/{field}/duplicate', [FieldController::class, 'duplicate'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.fields.duplicate');

    Route::post('collections/{collection}/fields/{field}/toggle-form-visibility', [FieldController::class, 'toggleFormVisibility'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.fields.toggle-form-visibility');

    Route::post('collections/{collection}/fields/{field}/layout-width', [FieldController::class, 'updateLayoutWidth'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.fields.update-layout-width');

    Route::put('collections/{collection}/form-layout', [FieldController::class, 'updateFormLayout'])
        ->middleware('permission:'.PermissionEnum::CanEditCollections->value)
        ->name('collections.form-layout.update');
});
