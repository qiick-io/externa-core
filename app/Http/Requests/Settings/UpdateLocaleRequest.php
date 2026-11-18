<?php

declare(strict_types=1);

namespace App\Http\Requests\Settings;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates the UI locale the authenticated user picks against `i18n.available_locales`.
 *
 * Every user may change their own locale, so `authorize()` allows the request.
 */
class UpdateLocaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, ValidationRule|string|object>>
     */
    public function rules(): array
    {
        $available = array_keys(config('i18n.available_locales', ['en' => 'English']));

        return [
            'locale' => ['required', 'string', Rule::in($available)],
        ];
    }
}
