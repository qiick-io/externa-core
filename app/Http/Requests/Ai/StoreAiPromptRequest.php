<?php

namespace App\Http\Requests\Ai;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validate creating a project-level saved AI prompt.
 */
class StoreAiPromptRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanManageAiPrompts->value);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:20000'],
        ];
    }
}
