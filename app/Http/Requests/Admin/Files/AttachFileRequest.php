<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Files;

use App\Http\Requests\Concerns\ValidatesFileManagerFieldsTrait;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates attaching a file to a polymorphic model with an optional role and order.
 */
class AttachFileRequest extends FormRequest
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
            ...$this->attachmentTargetRules(),
            'order' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
