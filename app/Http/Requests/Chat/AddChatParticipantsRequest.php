<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesChatAccessTrait;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Models\Chat;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates adding users and groups to a direct chat. The caller must be
 * allowed to start direct chats and belong to the thread, and only direct
 * chats have participants (422 otherwise), all before validation.
 */
class AddChatParticipantsRequest extends FormRequest
{
    use AuthorizesChatAccessTrait;
    use AuthorizesWithPermissionTrait;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanCreateDirectChats->value);
        $chat = $this->authorizeRouteChat();
        abort_unless($chat instanceof Chat && $chat->isDirect(), 422);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'user_ids' => ['nullable', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
            'group_ids' => ['nullable', 'array'],
            'group_ids.*' => ['integer', 'exists:user_groups,id'],
        ];
    }
}
