<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

/**
 * Validates the optional collection, search filter and result limit of the AI context item picker.
 *
 * Shares the search and limit rules of the file picker; results are filtered by the actor's
 * collection permissions in the service, so `authorize()` allows the request.
 */
class SearchAiContextItemsRequest extends SearchAiContextFilesRequest
{
    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'collection_id' => ['nullable', 'integer', 'exists:collections,id'],
            ...parent::rules(),
        ];
    }
}
