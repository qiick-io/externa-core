<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the locales and bounded field map sent to the AI content translator.
 *
 * Access is gated by the route middleware, so `authorize()` allows the request.
 */
class TranslateAiFieldsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'source_locale' => ['required', 'string', 'max:32'],
            'target_locale' => ['required', 'string', 'max:32', 'different:source_locale'],
            'fields' => ['required', 'array', 'min:1', 'max:50'],
            'fields.*' => ['nullable', 'string', 'max:20000'],
        ];
    }
}
