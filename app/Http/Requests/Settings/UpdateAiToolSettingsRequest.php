<?php

declare(strict_types=1);

namespace App\Http\Requests\Settings;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Authorizes and validates the list of mutating AI tools enabled for the project.
 *
 * Unknown tool names pass validation and are dropped by the controller against the tool registry.
 */
class UpdateAiToolSettingsRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanManageProjectSettings->value);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'write_tools' => ['nullable', 'array'],
            'write_tools.*' => ['string', 'max:128'],
        ];
    }
}
