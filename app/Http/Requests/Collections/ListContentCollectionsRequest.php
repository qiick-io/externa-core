<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Services\Validation\SearchQueryRulesService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates the collections list query: trashed toggle, search and a whitelisted sort.
 *
 * Sorting only by {@see self::SORTABLE_COLUMNS} keeps user input out of `ORDER BY`.
 */
class ListContentCollectionsRequest extends FormRequest
{
    /**
     * @var list<string>
     */
    public const SORTABLE_COLUMNS = [
        'name',
        'slug',
        'status',
        'updated_at',
    ];

    /**
     * Access is gated by the collections route middleware.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'trashed' => ['sometimes', 'boolean'],
            'search' => SearchQueryRulesService::search(),
            'sort' => ['nullable', 'string', Rule::in(self::SORTABLE_COLUMNS)],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
        ];
    }
}
