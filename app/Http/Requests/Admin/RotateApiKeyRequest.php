<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Models\ApiKey;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/**
 * Authorize rotating a project API key; there is no input, the new secret is generated.
 */
class RotateApiKeyRequest extends FormRequest
{
    public function authorize(): bool
    {
        $apiKey = $this->route('apiKey');

        abort_unless($apiKey instanceof ApiKey && Gate::allows('rotate', $apiKey), 403);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }
}
