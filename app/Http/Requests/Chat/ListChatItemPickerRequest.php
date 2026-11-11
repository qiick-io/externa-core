<?php

declare(strict_types=1);

namespace App\Http\Requests\Chat;

use App\Http\Requests\Concerns\ValidatesChatPickerPageTrait;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates the item picker of the new-thread dialog. Collection and item
 * read access filter the rows, so any signed-in user may search.
 */
class ListChatItemPickerRequest extends FormRequest
{
    use ValidatesChatPickerPageTrait;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return $this->chatPickerPageRules();
    }
}
