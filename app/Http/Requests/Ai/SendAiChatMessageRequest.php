<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Models\User;
use App\Services\Ai\AiConversationContextService;
use App\Services\Ai\AiDailyBudgetService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Validates a chat prompt (or a resume with tool approval decisions) for the streamed AI assistant.
 *
 * The daily budget (prompt cap and token budget) is enforced in `authorize()` so it answers 429
 * before any validation error and before the provider is called. Resume requests (with
 * `approvals`) skip the budget and require a `conversation_id` instead of a `message`.
 */
class SendAiChatMessageRequest extends FormRequest
{
    /**
     * @throws HttpResponseException when the user's daily AI prompt cap or token budget is used up
     */
    public function authorize(): bool
    {
        if ($this->isResume()) {
            return true;
        }

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
        $isResume = $this->isResume();

        return [
            'message' => [$isResume ? 'nullable' : 'required', 'string', 'max:20000'],
            'conversation_id' => [$isResume ? 'required' : 'nullable', 'string', 'uuid'],
            'attachment_ids' => ['nullable', 'array', 'max:5'],
            'attachment_ids.*' => ['uuid'],
            'context_item_ids' => ['nullable', 'array', 'max:'.AiConversationContextService::MAX_ITEMS],
            'context_item_ids.*' => ['integer', 'min:1'],
            'context_file_ids' => ['nullable', 'array', 'max:'.AiConversationContextService::MAX_FILES],
            'context_file_ids.*' => ['integer', 'min:1'],
            'context_prompt_ids' => ['nullable', 'array', 'max:'.AiConversationContextService::MAX_PROMPTS],
            'context_prompt_ids.*' => ['integer', 'min:1'],
            'approvals' => ['nullable', 'array', 'max:20'],
            'approvals.*.id' => ['required', 'string', 'max:255'],
            'approvals.*.approved' => ['required', 'boolean'],
        ];
    }

    /**
     * True when the request resumes a paused turn with tool approval decisions.
     */
    public function isResume(): bool
    {
        return $this->filled('approvals');
    }
}
