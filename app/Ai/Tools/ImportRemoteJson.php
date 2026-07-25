<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\ImportsCollectionRecords;
use App\Ai\Concerns\LogsAiToolUse;
use App\Ai\Support\SafeRemoteUrlValidator;
use App\Enums\PermissionEnum;
use App\Jobs\ImportCollectionJob;
use App\Models\Collection;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;
use Throwable;

/**
 * AI tool that imports collection records from a validated remote JSON URL.
 */
class ImportRemoteJson implements Tool
{
    use ChecksAiPermissions;
    use ImportsCollectionRecords;
    use LogsAiToolUse;

    private const DEFAULT_LIMIT = 200;

    private const MAX_LIMIT = 500;

    private const TIMEOUT_SECONDS = 20;

    private const MAX_BYTES = 5_242_880; // 5 MB

    private const ASYNC_THRESHOLD = 200;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'Import records from a public (or Bearer-authenticated) JSON/API URL into a collection. '
            .'Fetches JSON, extracts a list of objects (supports raw arrays, {data:[...]}, {items:[...]}, or a single object), '
            .'flattens first-level keys (nested objects/arrays become JSON strings), creates the collection/fields when needed, then imports items. '
            .'Use when the user pastes an API URL. Optional auth_bearer or auth_header for Authorization.';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if ($error = $this->requirePermission(PermissionEnum::CanCreateCollections)) {
                return $error;
            }

            if ($this->authenticatedUser() === null) {
                return 'Error: Unauthenticated.';
            }

            $url = trim((string) $request->string('url'));
            $collectionId = $request->integer('collection_id');
            $collectionName = trim((string) $request->string('collection_name'));
            $authBearer = trim((string) $request->string('auth_bearer'));
            $authHeader = trim((string) $request->string('auth_header'));
            $upsertKey = trim((string) $request->string('upsert_key'));
            $dryRun = $request->boolean('dry_run');
            $limit = $request->integer('limit', self::DEFAULT_LIMIT);

            if ($limit <= 0) {
                $limit = self::DEFAULT_LIMIT;
            }

            $limit = min($limit, self::MAX_LIMIT);

            if ($ssrfError = SafeRemoteUrlValidator::validate($url)) {
                return $ssrfError;
            }

            if ($collectionId <= 0 && $collectionName === '') {
                $collectionName = $this->suggestCollectionName($url);
            }

            if (! $dryRun && ! $request->boolean('force_sync') && $request->boolean('async')) {
                return $this->dispatchImport(
                    $this->authenticatedUser()->id,
                    $url,
                    $collectionId,
                    $collectionName,
                    $upsertKey,
                    $authBearer !== '' ? $authBearer : $authHeader,
                );
            }

            try {
                $payload = $this->fetchJson($url, $authBearer, $authHeader);
            } catch (Throwable $exception) {
                return 'Error: Unable to download JSON ('.$exception->getMessage().').';
            }

            $records = $this->extractRecords($payload);

            if (is_string($records)) {
                return $records;
            }

            $totalFound = count($records);

            if (
                ! $dryRun
                && ! $request->boolean('force_sync')
                && $totalFound > self::ASYNC_THRESHOLD
            ) {
                return $this->dispatchImport(
                    $this->authenticatedUser()->id,
                    $url,
                    $collectionId,
                    $collectionName,
                    $upsertKey,
                    $authBearer !== '' ? $authBearer : $authHeader,
                    $totalFound,
                );
            }

            $records = array_slice($records, 0, $limit);
            $flattened = [];
            $nestedKeys = [];

            foreach ($records as $record) {
                if (! is_array($record)) {
                    continue;
                }

                [$flat, $nested] = $this->flattenRecord($record);
                $flattened[] = $flat;

                foreach ($nested as $key) {
                    $nestedKeys[$key] = true;
                }
            }

            if ($flattened === []) {
                return 'Error: No object records found in JSON.';
            }

            if ($dryRun) {
                $collection = $collectionId > 0
                    ? Collection::query()->with('fields')->find($collectionId)
                    : Collection::query()->with('fields')->where('name', $collectionName)->first();

                if ($collectionId > 0 && $collection === null) {
                    return 'Error: Collection not found.';
                }

                return json_encode([
                    ...$this->previewAssociativeRows($collection, $flattened),
                    'url' => $url,
                    'records_found' => $totalFound,
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
            }

            $resolved = $this->resolveCollectionForImport($collectionId, $collectionName);

            if (is_string($resolved)) {
                return $resolved;
            }

            [$collection, $collectionCreated] = $resolved;

            try {
                $summary = $this->importAssociativeRows($collection, $flattened, $limit, $upsertKey);
            } catch (Throwable $exception) {
                return 'Error: Unable to import JSON ('.$exception->getMessage().').';
            }

            $this->logAiMutation($collection, 'import_remote_json');

            return json_encode([
                'ok' => true,
                'url' => route('collections.show', $collection),
                'source_url' => $url,
                'collection_id' => $collection->id,
                'collection_name' => $collection->name,
                'collection_created' => $collectionCreated,
                'records_found' => $totalFound,
                'records_imported_attempted' => count($flattened),
                'fields_created' => $summary['fields_created'],
                'mapped_headers' => $summary['mapped_headers'],
                'nested_keys_as_json_string' => array_keys($nestedKeys),
                'created' => $summary['created'],
                'updated' => $summary['updated'],
                'skipped' => $summary['skipped'],
                'errors' => $summary['errors'],
                'note' => $nestedKeys === []
                    ? null
                    : 'Nested objects/arrays were stored as JSON strings on first-level keys; deep nesting was not expanded.',
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'url' => $schema->string()->required()->description('Public or Bearer-authenticated JSON/API URL'),
            'collection_id' => $schema->integer()->description('Target collection id (optional if collection_name is set)'),
            'collection_name' => $schema->string()->description(
                'Collection name: find existing or create new. If omitted with no collection_id, derived from the URL path'
            ),
            'auth_bearer' => $schema->string()->description('Optional Bearer token (sent as Authorization: Bearer …)'),
            'auth_header' => $schema->string()->description(
                'Optional full Authorization header value (e.g. "Bearer xxx"). Ignored when auth_bearer is set'
            ),
            'limit' => $schema->integer()->description(
                'Max records to import (default '.self::DEFAULT_LIMIT.', max '.self::MAX_LIMIT.')'
            ),
            'upsert_key' => $schema->string()->description('Optional field name used to update matching items'),
            'dry_run' => $schema->boolean()->description('Preview inferred schema and sample records with zero writes'),
            'async' => $schema->boolean()->description('Queue the import; imports over 200 records are queued automatically'),
        ];
    }

    private function dispatchImport(
        int $userId,
        string $url,
        int $collectionId,
        string $collectionName,
        string $upsertKey,
        string $authBearer,
        ?int $total = null,
    ): string {
        $job = new ImportCollectionJob(
            userId: $userId,
            conversationId: $this->resolveConversationId(),
            sourceType: 'remote_json',
            url: $url,
            collectionId: $collectionId > 0 ? $collectionId : null,
            collectionName: $collectionName !== '' ? $collectionName : null,
            upsertKey: $upsertKey !== '' ? $upsertKey : null,
            authBearer: $authBearer !== '' ? $authBearer : null,
        );
        $job->setQueuedTotal($total);
        dispatch($job);

        return json_encode([
            'ok' => true,
            'async' => true,
            'job_id' => $job->jobId,
            'status' => 'queued',
            'status_url' => route('ai.import-jobs.show', $job->jobId),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    /**
     * @return array<string, mixed>|list<mixed>
     */
    private function fetchJson(string $url, string $authBearer, string $authHeader): array
    {
        $headers = [
            'Accept' => 'application/json',
        ];

        if ($authBearer !== '') {
            $headers['Authorization'] = 'Bearer '.$authBearer;
        } elseif ($authHeader !== '') {
            $headers['Authorization'] = $authHeader;
        }

        try {
            $response = Http::timeout(self::TIMEOUT_SECONDS)
                ->connectTimeout(10)
                ->withOptions([
                    'allow_redirects' => false,
                    'http_errors' => false,
                ])
                ->withHeaders($headers)
                ->get($url);
        } catch (ConnectionException $exception) {
            throw new \RuntimeException('timeout or connection failed: '.$exception->getMessage(), 0, $exception);
        } catch (RequestException $exception) {
            throw new \RuntimeException('request failed: '.$exception->getMessage(), 0, $exception);
        }

        if ($response->status() >= 400) {
            throw new \RuntimeException('HTTP '.$response->status());
        }

        $contentLength = $response->header('Content-Length');

        if (is_numeric($contentLength) && (int) $contentLength > self::MAX_BYTES) {
            throw new \RuntimeException('risposta troppo grande (max '.(int) (self::MAX_BYTES / 1024 / 1024).' MB)');
        }

        $body = $response->body();

        if (strlen($body) > self::MAX_BYTES) {
            throw new \RuntimeException('risposta troppo grande (max '.(int) (self::MAX_BYTES / 1024 / 1024).' MB)');
        }

        $decoded = json_decode($body, true);

        if (! is_array($decoded)) {
            throw new \RuntimeException('body is not valid JSON (object or array)');
        }

        return $decoded;
    }

    /**
     * @param  array<string, mixed>|list<mixed>  $payload
     * @return list<mixed>|string
     */
    private function extractRecords(array $payload): array|string
    {
        if ($payload === []) {
            return 'Error: Empty JSON.';
        }

        if (array_is_list($payload)) {
            return $payload;
        }

        foreach (['data', 'items', 'results', 'records', 'rows'] as $key) {
            if (! array_key_exists($key, $payload)) {
                continue;
            }

            $candidate = $payload[$key];

            if (! is_array($candidate)) {
                continue;
            }

            if ($candidate === []) {
                return 'Error: List "'.$key.'" is empty.';
            }

            if (array_is_list($candidate)) {
                return $candidate;
            }

            return [$candidate];
        }

        // Single object payload
        return [$payload];
    }

    /**
     * Flatten first-level keys; nested arrays/objects become JSON strings.
     *
     * @param  array<mixed, mixed>  $record
     * @return array{0: array<string, string>, 1: list<string>}
     */
    private function flattenRecord(array $record): array
    {
        $flat = [];
        $nestedKeys = [];

        foreach ($record as $key => $value) {
            if (! is_string($key) && ! is_int($key)) {
                continue;
            }

            $label = trim((string) $key);

            if ($label === '') {
                continue;
            }

            if (is_array($value) || is_object($value)) {
                $flat[$label] = json_encode($value, JSON_UNESCAPED_UNICODE) ?: '';
                $nestedKeys[] = $label;

                continue;
            }

            if (is_bool($value)) {
                $flat[$label] = $value ? '1' : '0';

                continue;
            }

            if ($value === null) {
                $flat[$label] = '';

                continue;
            }

            $flat[$label] = is_scalar($value) ? (string) $value : '';
        }

        return [$flat, $nestedKeys];
    }

    private function suggestCollectionName(string $url): string
    {
        $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
        $segments = array_values(array_filter(explode('/', $path), fn ($segment) => $segment !== ''));
        $last = $segments === [] ? 'remote_import' : (string) end($segments);
        $name = Str::slug($last, '_');

        return $name !== '' ? $name : 'remote_import';
    }
}
