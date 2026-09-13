<?php

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates notification sound preference updates.
 */
class UpdateNotificationPreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'sound_chat_enabled' => ['required', 'boolean'],
            'sound_notifications_enabled' => ['required', 'boolean'],
        ];
    }

    /**
     * @return array{sound_chat_enabled: bool, sound_notifications_enabled: bool}
     */
    public function preferenceValues(): array
    {
        $validated = $this->validated();

        return [
            'sound_chat_enabled' => (bool) $validated['sound_chat_enabled'],
            'sound_notifications_enabled' => (bool) $validated['sound_notifications_enabled'],
        ];
    }
}
