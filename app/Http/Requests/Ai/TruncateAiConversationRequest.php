<?php

declare(strict_types=1);

namespace App\Http\Requests\Ai;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
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
        /** @var User $user */
        $user = $this->user();

        $conversation = $user->conversations()
            ->where('id', (string) $this->route('conversation'))
            ->first();

        abort_if($conversation === null, Response::HTTP_NOT_FOUND);

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
