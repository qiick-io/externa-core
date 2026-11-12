<?php

declare(strict_types=1);

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\StoreChatAttachmentRequest;
use App\Models\Chat;
use App\Models\CollectionItemChatAttachment;
use App\Models\User;
use App\Services\Chat\ChatAttachmentAccessService;
use App\Services\Chat\ChatAttachmentUploadService;
use App\Services\Chat\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Single-request chat attachments keyed by Chat UUID: upload, download,
 * preview and cancelling a pending attachment.
 */
class ChatAttachmentController extends Controller
{
    public function __construct(
        private ChatService $chats,
        private ChatAttachmentUploadService $chatUploads,
        private ChatAttachmentAccessService $attachmentAccess,
    ) {}

    /**
     * Thread-scoped route: the request asserts access to `{chat}`, which
     * stays in the signature so route model binding resolves it.
     */
    public function storeAttachmentOnChat(StoreChatAttachmentRequest $request, Chat $chat): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        /** @var UploadedFile $uploaded */
        $uploaded = $request->validated()['file'];
        $attachment = $this->chatUploads->storeSingle($user, $uploaded);

        return response()->json(['attachment' => $attachment->toApiArray()], 201);
    }

    public function showAttachmentOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->chats->assertAccessible($request, $chat);

        return $this->attachmentAccess->download($request, $chat, $attachment);
    }

    public function showAttachmentPreviewOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): StreamedResponse {
        $this->chats->assertAccessible($request, $chat);

        return $this->attachmentAccess->preview($request, $chat, $attachment);
    }

    public function destroyAttachmentOnChat(
        Request $request,
        Chat $chat,
        CollectionItemChatAttachment $attachment,
    ): Response {
        $this->attachmentAccess->assertCancellable($request, $chat, $attachment);
        $attachment->delete();

        return response()->noContent();
    }
}
