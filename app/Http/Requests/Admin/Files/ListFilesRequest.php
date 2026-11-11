<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use App\Http\Requests\Concerns\ValidatesFileManagerFieldsTrait;
use App\Support\Validation\SearchQueryRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates the JSON file listing used by grid load-more and by field inputs.
 *
 * Besides folder browsing (parent, trash, search, tags, sort), `ids` lets field inputs
 * resolve the previews of selected files directly, without a parent scope.
 */
class ListFilesRequest extends FormRequest
{
    use ValidatesFileManagerFieldsTrait;

    /**
     * Columns the file manager listing can be sorted by.
     *
     * @var list<string>
     */
    public const SORTABLE_COLUMNS = ['name', 'size', 'created_at', 'updated_at'];

    /**
     * File manager access is already gated by the `can.manage.files` route middleware.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'parent_id' => $this->parentIdRules(),
            'search' => SearchQueryRules::search(),
            'trashed' => ['nullable', 'string', Rule::in(['only', 'with'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'sort' => ['nullable', 'string', Rule::in(self::SORTABLE_COLUMNS)],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'tag_ids' => ['nullable', 'array'],
            'tag_ids.*' => ['integer', 'min:1'],
            'tags' => ['nullable', 'array'],
            'tags.*' => $this->tagNameRules(),
            // ponytail: field inputs resolve selected file previews by id (no parent scope).
            'ids' => ['nullable', 'array', 'max:100'],
            'ids.*' => ['integer', 'min:1'],
        ];
    }
}
