<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validate a host an admin wants to block from MCP OAuth registration (#815).
 */
class BlockMcpOAuthRedirectHostRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanManageApiKeys->value);

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'host' => ['required', 'string', 'max:255', 'regex:/^[a-z0-9.-]+$/i'],
        ];
    }
}
