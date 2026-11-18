<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Laravel\Ai\Models\Conversation;
use Symfony\Component\HttpFoundation\Response;

/**
 * Validates the anchor message for truncating a conversation from that message onwards.
 *
 * The conversation must belong to the current user: `authorize()` resolves it and aborts with 404
 * before validation runs, so a foreign or unknown conversation answers 404, never 422.
 */
class TruncateAiConversationRequest extends FormRequest
{
    private ?Conversation $ownedConversation = null;

    public function authorize(): bool
    {
        $conversation = Conversation::query()->find((string) $this->route('conversation'));

        abort_unless(
            $conversation instanceof Conversation && Gate::allows('update', $conversation),
            Response::HTTP_NOT_FOUND,
        );

        $this->ownedConversation = $conversation;

        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'from_message_id' => ['required', 'string', 'uuid'],
        ];
    }

    /**
     * The owned conversation resolved during authorization.
     */
    public function conversation(): Conversation
    {
        abort_if($this->ownedConversation === null, Response::HTTP_NOT_FOUND);

        return $this->ownedConversation;
    }
}
