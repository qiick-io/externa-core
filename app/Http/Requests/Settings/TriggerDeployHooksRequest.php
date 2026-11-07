<?php

namespace App\Http\Requests\Settings;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Authorize and validate a manual deploy-hook trigger.
 */
class TriggerDeployHooksRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::DeployTrigger->value);

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'hook_id' => ['nullable', 'string', 'max:64'],
        ];
    }

    public function hookId(): ?string
    {
        $hookId = $this->validated('hook_id');

        return is_string($hookId) && $hookId !== '' ? $hookId : null;
    }
}
