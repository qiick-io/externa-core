<?php

namespace App\Jobs\Ai;

use App\Models\CollectionItem;
use App\Models\CollectionItemEmbedding;
use App\Services\Collections\CollectionItemValuesAssembler;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Laravel\Ai\Embeddings;
use Throwable;

/**
 * Generate and store an embedding for a collection item when AI embeddings are enabled.
 */
class GenerateCollectionItemEmbeddingJob implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public int $uniqueFor = 300;

    public function __construct(public int $collectionItemId) {}

    public function uniqueId(): string
    {
        return (string) $this->collectionItemId;
    }

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [10, 30, 60];
    }

    public function handle(CollectionItemValuesAssembler $assembler): void
    {
        if (! config('ai.embeddings.enabled')) {
            return;
        }

        $item = CollectionItem::query()->find($this->collectionItemId);
        if ($item === null) {
            return;
        }

        $payload = json_encode($assembler->assemble($item), JSON_UNESCAPED_UNICODE) ?: '';
        $hash = hash('sha256', $payload);

        $existing = CollectionItemEmbedding::query()
            ->where('collection_item_id', $item->id)
            ->first();

        if ($existing !== null && $existing->content_hash === $hash) {
            return;
        }

        try {
            $response = Embeddings::for([$payload])->generate();
            $vector = $response->first();

            if ($vector === []) {
                Log::warning('Embedding response missing vector', ['item_id' => $item->id]);

                return;
            }

            CollectionItemEmbedding::query()->updateOrCreate(
                ['collection_item_id' => $item->id],
                [
                    'provider' => (string) config('ai.default_for_embeddings', 'openai'),
                    'model' => $response->meta->model ?? null,
                    'vector' => array_values(array_map('floatval', $vector)),
                    'content_hash' => $hash,
                ],
            );
        } catch (Throwable $e) {
            // Soft-fail: embeddings are best-effort; failed() still covers worker timeouts.
            report($e);
        }
    }

    public function failed(?Throwable $exception): void
    {
        report($exception);

        Log::warning('Failed to generate collection item embedding after retries', [
            'item_id' => $this->collectionItemId,
            'error' => $exception?->getMessage(),
        ]);
    }
}
