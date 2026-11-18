<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use App\Http\Requests\Concerns\ValidatesFileManagerFieldsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates a bulk file manager action (move, delete, restore, tag, copy, …) on many files.
 *
 * `parent_id` is only used by move / copy and `tags` only by tag / untag.
 */
class BulkFileActionRequest extends FormRequest
{
    use ValidatesFileManagerFieldsTrait;

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
            'action' => ['required', 'string', Rule::in([
                'move',
                'delete',
                'restore',
                'force_delete',
                'favorite',
                'unfavorite',
                'tag',
                'untag',
                'copy',
            ])],
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
            'parent_id' => $this->parentIdRules(),
            'tags' => ['nullable', 'array'],
            'tags.*' => $this->tagNameRules(),
        ];
    }
}
