<?php

namespace App\Http\Requests\Ai;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates inbound collection import webhook payloads.
 */
class CollectionImportWebhookRequest extends FormRequest
{
    /**
     * Authorization is enforced by the webhook token in the controller.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Validate the target collection and bounded record payload.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'collection_id' => ['required', 'integer', 'exists:collections,id'],
            'records' => ['required', 'array', 'min:1', 'max:500'],
            'records.*' => ['required', 'array'],
            'upsert_key' => ['nullable', 'string', 'max:255'],
        ];
    }
}
