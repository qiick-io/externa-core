<?php

namespace App\Http\Requests\Ai;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validate updating a project-level saved AI prompt.
 */
class UpdateAiPromptRequest extends FormRequest
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
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'body' => ['sometimes', 'required', 'string', 'max:20000'],
        ];
    }
}
