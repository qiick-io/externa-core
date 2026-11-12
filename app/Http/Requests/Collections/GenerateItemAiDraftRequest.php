<?php

declare(strict_types=1);

namespace App\Http\Requests\Collections;

use App\Models\Collection;
use App\Models\User;
use App\Policies\CollectionPolicy;
use App\Services\Ai\AiDailyBudgetService;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/**
 * Validates an AI item draft request: a bounded brief and an enabled content locale.
 *
 * The `can-use-ai` and `ai.draft` permissions are the route's `permission:` middleware; here the
 * user also needs the collection's createItems or updateItems ability ({@see CollectionPolicy}),
 * because a draft is only useful to someone who can save it, and must be within the daily AI
 * budget (429 before validation and before the provider is called, as for translations).
 */
class GenerateItemAiDraftRequest extends FormRequest
{
    public const int MAX_PROMPT_LENGTH = 2000;

    /**
     * @throws HttpResponseException when the user's daily AI prompt cap or token budget is used up
     */
    public function authorize(): bool
    {
        $collection = $this->route('collection');

        /** @var User $user */
        $user = $this->user();
        $gate = Gate::forUser($user);

        if (! $collection instanceof Collection
            || ! ($gate->allows('createItems', $collection) || $gate->allows('updateItems', $collection))) {
            return false;
        }

        $exhaustedMessage = app(AiDailyBudgetService::class)->exhaustedMessage($user);

        if ($exhaustedMessage !== null) {
            throw new HttpResponseException(response()->json([
                'message' => $exhaustedMessage,
            ], Response::HTTP_TOO_MANY_REQUESTS));
        }

        return true;
    }

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'prompt' => ['required', 'string', 'min:3', 'max:'.self::MAX_PROMPT_LENGTH],
            'locale' => ['required', 'string', Rule::in(app(CollectionLocaleResolver::class)->allowedLocales())],
        ];
    }
}
