<?php

namespace App\Http\Requests\Notifications;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates marking in-app notifications as unread.
 */
class MarkNotificationsUnreadRequest extends FormRequest
{
    /**
     * Only authenticated users may mark notifications as unread.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Require a non-empty list of notification ids.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['uuid'],
        ];
    }
}
