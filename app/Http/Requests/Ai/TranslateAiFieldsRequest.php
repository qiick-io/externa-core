<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Models\User;
use App\Services\Ai\AiDailyBudgetService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Validates the locales and bounded field map sent to the AI content translator.
 *
 * Access is gated by the route middleware; `authorize()` only enforces the user's daily AI budget
 * (prompt cap and token budget), answering 429 before validation and before the provider is called.
 */
class TranslateAiFieldsRequest extends FormRequest
{
    /**
     * @throws HttpResponseException when the user's daily AI prompt cap or token budget is used up
     */
    public function authorize(): bool
    {
        /** @var User $user */
        $user = $this->user();
        $exhaustedMessage = app(AiDailyBudgetService::class)->exhaustedMessage($user);

        if ($exhaustedMessage !== null) {
            throw new HttpResponseException(response()->json([
                'message' => $exhaustedMessage,
            ], Response::HTTP_TOO_MANY_REQUESTS));
        }

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'source_locale' => ['required', 'string', 'max:32'],
            'target_locale' => ['required', 'string', 'max:32', 'different:source_locale'],
            'fields' => ['required', 'array', 'min:1', 'max:50'],
            'fields.*' => ['nullable', 'string', 'max:20000'],
        ];
    }
}
