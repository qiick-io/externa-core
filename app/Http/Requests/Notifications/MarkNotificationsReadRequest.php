<?php

namespace App\Http\Requests\Notifications;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates marking in-app notifications as read.
 */
class MarkNotificationsReadRequest extends FormRequest
{
    /**
     * Only authenticated users may mark notifications as read.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Accept optional notification ids or an all-unread flag.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'ids' => ['nullable', 'array'],
            'ids.*' => ['uuid'],
            'all' => ['sometimes', 'boolean'],
        ];
    }
}
