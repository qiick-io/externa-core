<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use App\Http\Requests\Concerns\ValidatesFileManagerFieldsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates moving a file or folder to another folder or disk.
 *
 * `version` is the optional timestamp the client last saw, passed on to the move.
 */
class MoveFileRequest extends FormRequest
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
            'parent_id' => $this->parentIdRules(),
            'disk' => $this->diskRules(),
            'version' => ['nullable', 'date'],
        ];
    }
}
