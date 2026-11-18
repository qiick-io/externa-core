<?php

declare(strict_types=1);

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ai\TruncateAiConversationRequest;
use App\Services\Ai\AiConversationMutationService;
use Illuminate\Http\JsonResponse;
use Laravel\Ai\Models\ConversationMessage;
use Symfony\Component\HttpFoundation\Response;

/**
 * JSON API for rewinding an AI conversation to an earlier message (edit and regenerate).
 */
class AiConversationTruncateController extends Controller
{
    public function __construct(
        private readonly AiConversationMutationService $mutations,
    ) {}

    /**
     * Delete a message and every message that follows it in the conversation.
     *
     * Ownership is resolved (404) by the request before validation runs.
     */
    public function truncate(TruncateAiConversationRequest $request): JsonResponse
    {
        $owned = $request->conversation();

        $validated = $request->validated();

        $anchor = ConversationMessage::query()
            ->where('conversation_id', $owned->id)
            ->where('id', $validated['from_message_id'])
            ->first();

        abort_if($anchor === null, Response::HTTP_NOT_FOUND);

        $deleted = $this->mutations->truncateFromMessage($owned, $anchor);

        $owned->touch();

        return response()->json([
            'ok' => true,
            'deleted' => $deleted,
        ]);
    }
}
