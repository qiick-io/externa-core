<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Http\Requests\Concerns\ValidatesChatPickerPageTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the people directory (users and groups) of the direct-chat
 * picker. Only users who may start direct chats can list the directory.
 */
class ListChatDirectoryRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;
    use ValidatesChatPickerPageTrait;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanCreateDirectChats->value);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return $this->chatPickerPageRules();
    }
}
