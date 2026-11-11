<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use App\Models\Chat;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the per-collection chat notification toggle, on a thread or on
 * the item-form alias. Subscriptions exist only for item threads, so another
 * thread is rejected with 422 before the payload is validated.
 */
class UpdateChatNotifyRequest extends FormRequest
{
    use AuthorizesChatAccessTrait;

    public function authorize(): bool
    {
        $chat = $this->authorizeRouteChat();

        if ($chat instanceof Chat) {
            abort_unless($chat->isItem() && $chat->collection_id !== null, 422);
        } else {
            $this->authorizeItemContext();
        }

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'notify' => ['required', 'boolean'],
        ];
    }
}
