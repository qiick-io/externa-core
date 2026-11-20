<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validate a bulk block of MCP OAuth clients from the admin page (#815).
 */
class BulkBlockMcpOAuthClientsRequest extends FormRequest
{
    use AuthorizesWithPermissionTrait;

    public function authorize(): bool
    {
        $this->authorizePermission(PermissionEnum::CanManageApiKeys->value);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'client_ids' => ['required', 'array', 'min:1', 'max:100'],
            'client_ids.*' => ['required', 'string', 'distinct'],
        ];
    }

    /**
     * @return list<string>
     */
    public function clientIds(): array
    {
        /** @var list<string> $clientIds */
        $clientIds = array_values(array_filter($this->array('client_ids'), is_string(...)));

        return $clientIds;
    }
}
