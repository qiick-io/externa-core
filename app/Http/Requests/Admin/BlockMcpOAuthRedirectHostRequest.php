<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Enums\PermissionEnum;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Services\Mcp\McpOAuthRedirectUriService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;
use InvalidArgumentException;

/**
 * Validate a host an admin wants to block from MCP OAuth registration (#815).
 * Unicode hosts are accepted and stored as ASCII (UTS #46 / IDNA2008, nontransitional).
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
     * @return array<string, list<string|\Closure>>
     */
    public function rules(): array
    {
        return [
            'host' => [
                'required',
                'string',
                'max:255',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_string($value)) {
                        return;
                    }

                    try {
                        app(McpOAuthRedirectUriService::class)->normalizeHost($value);
                    } catch (InvalidArgumentException) {
                        $fail(__('The host is not a valid domain name.'));
                    }
                },
            ],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('host') && is_string($this->input('host'))) {
            $this->merge([
                'host' => trim((string) $this->input('host')),
            ]);
        }
    }

    /**
     * Store the ASCII form so block comparisons never depend on the form's Unicode spelling.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $host = $this->input('host');

            if (! is_string($host)) {
                return;
            }

            try {
                $this->merge([
                    'host' => app(McpOAuthRedirectUriService::class)->normalizeHost($host),
                ]);
            } catch (InvalidArgumentException) {
                $validator->errors()->add('host', __('The host is not a valid domain name.'));
            }
        });
    }
}
