<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\StoreChatAttachmentRequest;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use App\Services\Chat\ChatAttachmentAccessService;
use App\Services\Chat\ChatAttachmentUploadService;
use App\Services\Chat\ChatService;
use App\Traits\ResolvesItemChatTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Item-form chat alias for single-request attachments: upload, download,
 * preview and cancelling a pending attachment.
 */
class ItemChatAttachmentController extends Controller
{
    use ResolvesItemChatTrait;

    public function __construct(
        private ChatService $chats,
        private ChatAttachmentUploadService $chatUploads,
        private ChatAttachmentAccessService $attachmentAccess,
    ) {}

    public function storeAttachment(StoreChatAttachmentRequest $request, Collection $collection, CollectionItem $item): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        /** @var UploadedFile $uploaded */
        $uploaded = $request->validated()['file'];
        $attachment = $this->chatUploads->storeSingle($user, $uploaded);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    public function showAttachment(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        return $this->attachmentAccess->download($request, $chat, $attachment);
    }

    public function showAttachmentPreview(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        return $this->attachmentAccess->preview($request, $chat, $attachment);
    }

    public function destroyAttachment(
        Request $request,
        Collection $collection,
        CollectionItem $item,
        CollectionItemChatAttachment $attachment,
    ): Response {
        $this->assertItemContext($request, $collection, $item);
        $chat = $this->chatFromAttachment($item, $attachment);

        $this->attachmentAccess->assertCancellable($request, $chat, $attachment);
        $attachment->delete();

        return response()->noContent();
    }
}
