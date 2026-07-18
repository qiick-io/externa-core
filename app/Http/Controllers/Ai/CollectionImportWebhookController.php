<?php

namespace App\Http\Controllers\Ai;

use App\Ai\Concerns\ImportsCollectionRecords;
use App\Http\Controllers\Controller;
use App\Http\Requests\Ai\CollectionImportWebhookRequest;
use App\Models\Collection;
use Illuminate\Database\Eloquent\Model;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class CollectionImportWebhookController extends Controller
{
    use ImportsCollectionRecords;

    public function __invoke(CollectionImportWebhookRequest $request): Response
    {
        $configuredToken = (string) config('ai.webhook_token', '');
        $providedToken = (string) ($request->bearerToken() ?: $request->header('X-AI-Webhook-Token', ''));

        abort_if(
            $configuredToken === '' || ! hash_equals($configuredToken, $providedToken),
            Response::HTTP_FORBIDDEN,
            'Invalid webhook token.',
        );

        $validated = $request->validated();
        $collection = Collection::query()->with('fields')->findOrFail($validated['collection_id']);
        $records = array_map(fn (array $record): array => array_map(
            fn (mixed $value): string => is_scalar($value) || $value === null
                ? (string) ($value ?? '')
                : (json_encode($value, JSON_UNESCAPED_UNICODE) ?: ''),
            $record,
        ), $validated['records']);

        try {
            $summary = $this->importAssociativeRows(
                $collection,
                $records,
                500,
                (string) ($validated['upsert_key'] ?? ''),
            );
        } catch (Throwable $exception) {
            return response()->json(['message' => $exception->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json([
            'ok' => true,
            'collection_id' => $collection->id,
            'url' => route('collections.show', $collection),
            ...$summary,
        ]);
    }

    protected function logAiMutation(Model $subject, string $action): void
    {
        // Signed webhooks have no interactive user/conversation to attribute.
    }
}
