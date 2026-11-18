<?php

declare(strict_types=1);

namespace App\Http\Controllers\Ai;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ai\BulkDestroyAiConversationsRequest;
use App\Models\User;
use App\Services\Ai\AiConversationMutationService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * JSON API for deleting several of the authenticated user's AI conversations at once.
 */
class AiConversationBulkController extends Controller
{
    public function __construct(
        private readonly AiConversationMutationService $mutations,
    ) {}

    /**
     * Delete multiple owned conversations in one transaction.
     */
    public function bulkDestroy(BulkDestroyAiConversationsRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validated();

        $ids = array_values(array_unique($validated['ids']));

        $ownedIds = $user->conversations()
            ->whereIn('id', $ids)
            ->pluck('id')
            ->all();

        abort_if(count($ownedIds) !== count($ids), Response::HTTP_NOT_FOUND);

        $deleted = $this->mutations->deleteConversations($ownedIds);

        return response()->json([
            'ok' => true,
            'deleted' => $deleted,
        ]);
    }
}
