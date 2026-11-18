<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\ApiKeys\RotateApiKeyAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\RotateApiKeyRequest;
use App\Models\ApiKey;
use App\Models\User;
use Illuminate\Http\RedirectResponse;

/**
 * Rotate a project API key: a new secret, shown once; the old one keeps working for the grace
 * window (see {@see RotateApiKeyAction}).
 */
class ApiKeyRotationController extends Controller
{
    public function __invoke(RotateApiKeyRequest $request, ApiKey $apiKey, RotateApiKeyAction $rotateApiKeyAction): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $issuedApiKey = $rotateApiKeyAction->execute($apiKey, $actor);

        $request->session()->flash('plain_text_api_key', $issuedApiKey->plainTextKey);

        return redirect()
            ->route('api-keys.index')
            ->with('success', __('API key rotated. The previous secret keeps working until :time.', [
                'time' => $issuedApiKey->apiKey->previous_key_valid_until?->toDayDateTimeString() ?? '',
            ]));
    }
}
