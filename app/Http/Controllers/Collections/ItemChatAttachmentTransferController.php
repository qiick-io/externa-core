<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Actions\Chat\AddChatAttachmentToFieldAction;
use App\Actions\Chat\TransferChatAttachmentToFileAction;
use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\AddChatAttachmentToFieldRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Chat\ChatAttachmentAccessService;
use App\Services\Chat\ChatService;
use App\Traits\ResolvesItemChatTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Item-form chat alias for moving an attachment out of the chat: save it to
 * Files, or add it to a file field of the item.
 */
class ItemChatAttachmentTransferController extends Controller
{
    use ResolvesItemChatTrait;

    public function __construct(
        private ChatService $chats,
        private ChatAttachmentAccessService $attachmentAccess,
        private EffectivePermissionResolverService $permissionResolver,
    ) {}

    public function saveToFiles(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
        TransferChatAttachmentToFileAction $transferChatAttachmentToFile,
    ): JsonResponse {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);
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
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
        AddChatAttachmentToFieldAction $addChatAttachmentToField,
    ): JsonResponse {
        $chat = $request->itemChat();
        $chatCollection = $chat->collection;
        $chatItem = $chat->item;
        abort_unless($chatCollection instanceof Collection && $chatItem instanceof CollectionItem, 404);

        $added = $addChatAttachmentToField->execute($request, $chatCollection, $chatItem, $attachment, $request->validated()['field']);

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
