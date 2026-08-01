<?php

namespace App\Http\Requests\Settings;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Gate access to two-factor security settings.
 *
 * Intentionally does not use Fortify's InteractsWithTwoFactorState: ensureStateIsValid()
 * wipes unconfirmed secrets on later security.edit visits, which breaks OTP confirm
 * when Inertia/middleware revisits the page while the QR modal is still open.
 */
class TwoFactorAuthenticationRequest extends FormRequest
{
    /**
     * Two-factor settings pages do not accept input fields.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [];
    }
}
