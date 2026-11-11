<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Models\CollectionItemChatAttachment;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Services\Chat\ChatAttachmentAccessService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates putting a chat attachment into a field of the thread's item.
 * Access to the thread (404 when the item has none yet), the item-chat kind
 * (422), the attachment and the item write (403) are checked before the
 * `field` payload, so a caller without access never sees a validation error.
 */
class AddChatAttachmentToFieldRequest extends FormRequest
{
    use AuthorizesChatAccessTrait;

    private ?Chat $itemChat = null;

    public function authorize(): bool
    {
        $chat = $this->authorizeChatOrItemThread();
        abort_unless($chat instanceof Chat, 404);
        abort_unless($chat->isItem(), 422);

        $attachment = $this->route('attachment');
        abort_unless($attachment instanceof CollectionItemChatAttachment, 404);
        app(ChatAttachmentAccessService::class)->assertAccessible($this, $chat, $attachment);

        $collection = $chat->collection;
        $item = $chat->item;
        abort_unless($collection instanceof Collection && $item instanceof CollectionItem, 404);
        app(CollectionPermissionEnforcerService::class)->assertItemWritable($this, $collection, $item);

        $this->itemChat = $chat;

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'field' => ['required', 'string'],
        ];
    }

    /**
     * The item thread checked in `authorize()`.
     */
    public function itemChat(): Chat
    {
        abort_unless($this->itemChat instanceof Chat, 404);

        return $this->itemChat;
    }
}
