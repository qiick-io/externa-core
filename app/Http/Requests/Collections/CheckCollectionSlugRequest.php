<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the live slug availability check of the collection form (`slug`, optional `exclude` id).
 *
 * The controller slugifies the input; this only bounds what reaches it.
 */
class CheckCollectionSlugRequest extends FormRequest
{
    /**
     * Access is gated by the collections route middleware.
     */
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
            'slug' => ['required', 'string', 'max:255'],
            'exclude' => ['nullable', 'integer'],
        ];
    }
}
