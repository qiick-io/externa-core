<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use App\Models\Chat;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Services\Chat\ChatService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a new chat message: body, mentions, claimed attachments and the
 * replied-to message. The "body or attachment" rule, mention ACLs and the
 * reply target need the thread, so the controller checks them after this.
 */
class StoreChatMessageRequest extends FormRequest
{
    use AuthorizesChatAccessTrait;

    public function authorize(): bool
    {
        $chat = $this->authorizeChatOrItemThread();
        $collection = $this->route('collection');
        $item = $this->route('item');

        // The item-form alias creates the item's thread on the first post:
        // check access on the thread it would create, without creating it.
        if (! $chat instanceof Chat && $collection instanceof Collection && $item instanceof CollectionItem) {
            $prospectiveChat = new Chat;
            $prospectiveChat->kind = Chat::KIND_ITEM;
            $prospectiveChat->collection_id = $collection->id;
            $prospectiveChat->collection_item_id = $item->id;
            $prospectiveChat->setRelation('collection', $collection);
            $prospectiveChat->setRelation('item', $item);

            app(ChatService::class)->assertAccessible($this, $prospectiveChat);
        }

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'body' => ['nullable', 'string', 'max:20000'],
            'mentioned_user_ids' => ['sometimes', 'array'],
            'mentioned_user_ids.*' => ['integer', 'exists:users,id'],
            'attachment_ids' => ['sometimes', 'array'],
            'attachment_ids.*' => ['uuid'],
            'reply_to_id' => ['nullable', 'integer', 'exists:chat_messages,id'],
        ];
    }
}
