<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Models\User;
use App\Services\Ai\AiConversationContextService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpFoundation\Response;

/**
 * Validates a chat prompt (or a resume with tool approval decisions) for the streamed AI assistant.
 *
 * The daily prompt limit is enforced in `authorize()` so it still answers 429 before any validation
 * error, exactly as when the controller checked it first. Resume requests (with `approvals`)
 * skip the limit and require a `conversation_id` instead of a `message`.
 */
class SendAiChatMessageRequest extends FormRequest
{
    /**
     * @throws HttpResponseException when a new prompt would exceed `ai.daily_prompt_limit`
     */
    public function authorize(): bool
    {
        if (! $this->isResume() && $this->hasReachedDailyPromptLimit()) {
            throw new HttpResponseException(response()->json([
                'message' => 'Daily AI prompt limit reached.',
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

    /**
     * True when the user has already sent `ai.daily_prompt_limit` prompts today (0 disables the limit).
     */
    private function hasReachedDailyPromptLimit(): bool
    {
        $dailyPromptLimit = (int) config('ai.daily_prompt_limit', 0);

        if ($dailyPromptLimit <= 0) {
            return false;
        }

        /** @var User $user */
        $user = $this->user();

        return Activity::query()
            ->where('log_name', 'ai')
            ->where('event', 'ai_prompt')
            ->where('causer_type', $user->getMorphClass())
            ->where('causer_id', $user->id)
            ->where('created_at', '>=', now()->startOfDay())
            ->count() >= $dailyPromptLimit;
    }
}
