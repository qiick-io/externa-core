<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Services\Validation\SearchQueryRulesService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the optional `search` filter of the AI assistant pickers (context collections, saved prompts).
 *
 * The controllers filter the lists by read permission or show them to every AI user,
 * so `authorize()` allows the request.
 */
class SearchAiPickerRequest extends FormRequest
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
            'search' => SearchQueryRulesService::search(),
        ];
    }
}
