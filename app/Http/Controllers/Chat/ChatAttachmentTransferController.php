<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Actions\Chat\AddChatAttachmentToFieldAction;
use App\Actions\Chat\TransferChatAttachmentToFileAction;
use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\AddChatAttachmentToFieldRequest;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Chat\ChatAttachmentAccessService;
use App\Services\Chat\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Moving a chat attachment out of the chat, keyed by Chat UUID: save it to
 * Files, or add it to a file field of the thread's item.
 */
class ChatAttachmentTransferController extends Controller
{
    public function __construct(
        private ChatService $chats,
        private ChatAttachmentAccessService $attachmentAccess,
        private EffectivePermissionResolverService $permissionResolver,
    ) {}

    public function saveToFilesOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
        TransferChatAttachmentToFileAction $transferChatAttachmentToFile,
    ): JsonResponse {
        $this->chats->assertAccessible($request, $chat);
        $this->attachmentAccess->assertAccessible($request, $chat, $attachment);

        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless(
            $this->permissionResolver->hasPermission($user, PermissionEnum::CanCreateFiles->value),
            403,
        );

        $file = $transferChatAttachmentToFile->execute($attachment);

        return response()->json([
            'attachment' => $attachment->fresh()?->toApiArray(),
            'file' => [
                'id' => $file->id,
                'name' => $file->name,
            ],
        ]);
    }

    public function addToField(
        AddChatAttachmentToFieldRequest $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
        AddChatAttachmentToFieldAction $addChatAttachmentToField,
    ): JsonResponse {
        $collection = $chat->collection;
        $item = $chat->item;
        abort_unless($collection instanceof Collection && $item instanceof CollectionItem, 404);

        $added = $addChatAttachmentToField->execute($request, $collection, $item, $attachment, $request->validated()['field']);

        return response()->json([
            'attachment' => $attachment->fresh()?->toApiArray(),
            'file' => [
                'id' => $added['file']->id,
                'name' => $added['file']->name,
            ],
            'field' => $added['field'],
            'value' => $added['value'],
        ]);
    }
}
