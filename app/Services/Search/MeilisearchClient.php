<?php

namespace App\Services\Search;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Thin Meilisearch HTTP client (no SDK). No-op when sync is disabled.
 */
class MeilisearchClient
{
    public function enabled(): bool
    {
        if (! config('meilisearch.enabled')) {
            return false;
        }

        return is_string(config('meilisearch.host')) && config('meilisearch.host') !== '';
    }

    public function indexUid(): string
    {
        $index = config('meilisearch.index');

        return is_string($index) && $index !== '' ? $index : 'externa';
    }

    /**
     * @param  list<array<string, mixed>>  $documents
     */
    public function upsertDocuments(array $documents): void
    {
        if (! $this->enabled() || $documents === []) {
            return;
        }

        $this->ensureIndex();

        $index = rawurlencode($this->indexUid());
        // Documents also carry collection_id — Meili cannot infer the primary key
        // without an explicit primaryKey=id (query or ensureIndex).
        $response = $this->http()->post(
            "/indexes/{$index}/documents?".http_build_query(['primaryKey' => 'id']),
            $documents,
        );

        if (! $response->successful()) {
            throw new RuntimeException(sprintf(
                'Meilisearch upsert failed: HTTP %s — %s',
                $response->status(),
                $response->body(),
            ));
        }
    }

    /**
     * Create the index with primaryKey=id when missing (idempotent).
     */
    public function ensureIndex(): void
    {
        if (! $this->enabled()) {
            return;
        }

        $response = $this->http()->post('/indexes', [
            'uid' => $this->indexUid(),
            'primaryKey' => 'id',
        ]);

        // 201 created, 202 accepted, 409 already exists — all fine.
        if ($response->successful() || $response->status() === 409) {
            return;
        }

        throw new RuntimeException(sprintf(
            'Meilisearch ensureIndex failed: HTTP %s — %s',
            $response->status(),
            $response->body(),
        ));
    }

    public function deleteDocument(string $documentId): void
    {
        if (! $this->enabled()) {
            return;
        }

        $index = rawurlencode($this->indexUid());
        $id = rawurlencode($documentId);
        $response = $this->http()->delete("/indexes/{$index}/documents/{$id}");

        // 404 = already gone
        if ($response->status() === 404) {
            return;
        }

        if (! $response->successful()) {
            throw new RuntimeException(sprintf(
                'Meilisearch delete failed: HTTP %s — %s',
                $response->status(),
                $response->body(),
            ));
        }
    }

    private function http(): PendingRequest
    {
        $host = (string) config('meilisearch.host');
        $key = config('meilisearch.api_key');

        $request = Http::baseUrl($host)
            ->timeout(10)
            ->connectTimeout(3)
            ->acceptJson()
            ->asJson()
            ->withHeaders(['User-Agent' => 'Externa-Meilisearch/1.0']);

        if (is_string($key) && $key !== '') {
            $request = $request->withToken($key);
        }

        return $request;
    }
}
