<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Services\Validation\SearchQueryRulesService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the search filter and result limit of the AI context file picker.
 *
 * Results are filtered by the actor's file permissions in the service, so `authorize()` allows the request.
 */
class SearchAiContextFilesRequest extends FormRequest
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
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ];
    }
}
