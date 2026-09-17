<?php

namespace App\Http\Controllers\Ai;

use App\Ai\Concerns\ImportsCollectionRecords;
use App\Http\Controllers\Controller;
use App\Http\Requests\Ai\CollectionImportWebhookRequest;
use App\Models\Collection;
use Illuminate\Database\Eloquent\Model;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Import collection records from HMAC-signed webhook payloads.
 */
class CollectionImportWebhookController extends Controller
{
    use ImportsCollectionRecords;

    /**
     * Verify HMAC over body+collection_id, then import associative record rows.
     */
    public function __invoke(CollectionImportWebhookRequest $request): Response
    {
        $configuredToken = (string) config('ai.webhook_token', '');
        $rawBody = $request->getContent();
        $validated = $request->validated();
        $collectionId = (string) $validated['collection_id'];
        $providedSignature = (string) $request->header('X-AI-Webhook-Signature', '');

        abort_if(
            $configuredToken === '' || ! hash_equals(
                self::sign($rawBody, $collectionId, $configuredToken),
                $providedSignature,
            ),
            Response::HTTP_FORBIDDEN,
            'Invalid webhook signature.',
        );

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

    /**
     * HMAC-SHA256 over raw body + collection_id, keyed by AI_WEBHOOK_TOKEN.
     */
    public static function sign(string $rawBody, string $collectionId, string $secret): string
    {
        return 'sha256='.hash_hmac('sha256', $rawBody."\n".$collectionId, $secret);
    }

    /**
     * Skip AI mutation logging because signed webhooks have no interactive user context.
     */
    protected function logAiMutation(Model $subject, string $action): void {}
}
