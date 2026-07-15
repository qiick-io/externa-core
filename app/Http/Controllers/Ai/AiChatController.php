<?php

namespace App\Http\Controllers\Ai;

use App\Ai\Agents\AppAssistant;
use App\Ai\Support\AiActivityLogger;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Responses\StreamedAgentResponse;
use Symfony\Component\HttpFoundation\Response;

class AiChatController extends Controller
{
    public function __invoke(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'message' => ['required', 'string', 'max:20000'],
            'conversation_id' => ['nullable', 'string', 'uuid'],
        ]);

        $conversationId = $validated['conversation_id'] ?? null;

        if (is_string($conversationId) && $conversationId !== '') {
            $owned = Conversation::query()
                ->where('id', $conversationId)
                ->where('user_id', $user->id)
                ->exists();

            abort_unless($owned, Response::HTTP_NOT_FOUND);
        }

        AiActivityLogger::prompt($user, $validated['message'], $conversationId);

        $agent = new AppAssistant;

        if (is_string($conversationId) && $conversationId !== '') {
            $agent->continue($conversationId, as: $user);
        } else {
            $agent->forUser($user);
        }

        $stream = $agent
            ->stream($validated['message'])
            ->then(function (StreamedAgentResponse $response) use ($user): void {
                AiActivityLogger::response(
                    $user,
                    (string) ($response->text ?? ''),
                    $response->conversationId,
                    $response->meta->provider ?? null,
                    $response->meta->model ?? null,
                );
            });

        return response()->stream(function () use ($stream): void {
            foreach ($stream as $event) {
                echo 'data: '.((string) $event)."\n\n";

                if (ob_get_level() > 0) {
                    ob_flush();
                }

                flush();
            }

            if ($stream->conversationId !== null) {
                echo 'data: '.json_encode([
                    'type' => 'conversation',
                    'conversation_id' => $stream->conversationId,
                ])."\n\n";

                if (ob_get_level() > 0) {
                    ob_flush();
                }

                flush();
            }

            echo "data: [DONE]\n\n";

            if (ob_get_level() > 0) {
                ob_flush();
            }

            flush();
        }, headers: [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ]);
    }
}
