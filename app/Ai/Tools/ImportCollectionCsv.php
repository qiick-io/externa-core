<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\ImportsCollectionRecords;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Jobs\ImportCollectionJob;
use App\Models\AiChatAttachment;
use App\Models\Collection;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Stringable;
use Throwable;

class ImportCollectionCsv implements Tool
{
    use ChecksAiPermissions;
    use ImportsCollectionRecords;
    use LogsAiToolUse;

    private const MAX_ROWS = 500;

    private const ASYNC_THRESHOLD = 200;

    public function description(): Stringable|string
    {
        return 'Import rows from an uploaded CSV/TXT/XLSX chat attachment into a collection. '
            .'Uses the first row as headers. Pass attachment_id plus collection_id and/or collection_name. '
            .'Infers missing field types, supports upsert_key, and supports a zero-write dry_run preview.';
    }

    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            if ($error = $this->requirePermission(PermissionEnum::CanCreateCollections)) {
                return $error;
            }

            $user = $this->authenticatedUser();

            if ($user === null) {
                return 'Error: Non autenticato.';
            }

            $attachmentId = trim((string) $request->string('attachment_id'));
            $collectionId = $request->integer('collection_id');
            $collectionName = trim((string) $request->string('collection_name'));
            $upsertKey = trim((string) $request->string('upsert_key'));
            $dryRun = $request->boolean('dry_run');

            if ($attachmentId === '') {
                return 'Error: Serve attachment_id.';
            }

            if ($collectionId <= 0 && $collectionName === '') {
                return 'Error: Serve collection_id oppure collection_name.';
            }

            $attachment = AiChatAttachment::query()
                ->where('id', $attachmentId)
                ->where('user_id', $user->id)
                ->first();

            if ($attachment === null) {
                return 'Error: Allegato non trovato o non di tua proprietà.';
            }

            if ($attachment->isExpired()) {
                $attachment->delete();

                return 'Error: Allegato scaduto. Caricalo di nuovo.';
            }

            $absolutePath = $attachment->absolutePath();

            if (! is_readable($absolutePath)) {
                return 'Error: Impossibile leggere il file allegato.';
            }

            try {
                $rows = $this->readRows($absolutePath, $attachment->original_name);
            } catch (Throwable $exception) {
                return 'Error: Impossibile leggere il file ('.$exception->getMessage().').';
            }

            if (
                ! $dryRun
                && ! $request->boolean('force_sync')
                && ($request->boolean('async') || count($rows) > self::ASYNC_THRESHOLD)
            ) {
                $job = new ImportCollectionJob(
                    userId: $user->id,
                    conversationId: $this->resolveConversationId(),
                    sourceType: strtolower(pathinfo($attachment->original_name, PATHINFO_EXTENSION)) === 'xlsx'
                        ? 'excel'
                        : 'csv',
                    attachmentId: $attachment->id,
                    collectionId: $collectionId > 0 ? $collectionId : null,
                    collectionName: $collectionName !== '' ? $collectionName : null,
                    upsertKey: $upsertKey !== '' ? $upsertKey : null,
                );
                $job->setQueuedTotal(count($rows));
                dispatch($job);

                return json_encode([
                    'ok' => true,
                    'async' => true,
                    'job_id' => $job->jobId,
                    'status' => 'queued',
                    'status_url' => route('ai.import-jobs.show', $job->jobId),
                ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
            }

            if ($dryRun) {
                $collection = $collectionId > 0
                    ? Collection::query()->with('fields')->find($collectionId)
                    : Collection::query()->with('fields')->where('name', $collectionName)->first();

                if ($collectionId > 0 && $collection === null) {
                    return 'Error: Collezione non trovata.';
                }

                return json_encode(
                    $this->previewAssociativeRows($collection, $rows),
                    JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE,
                ) ?: '{}';
            }

            $resolved = $this->resolveCollectionForImport($collectionId, $collectionName);

            if (is_string($resolved)) {
                return $resolved;
            }

            [$collection, $collectionCreated] = $resolved;

            try {
                $summary = $this->importAssociativeRows($collection, $rows, self::MAX_ROWS, $upsertKey);
            } catch (Throwable $exception) {
                return 'Error: Impossibile importare il file ('.$exception->getMessage().').';
            }

            $this->logAiMutation($collection, 'import_spreadsheet');

            // ponytail: delete after successful import; TTL cleanup covers abandoned uploads
            $attachment->delete();

            return json_encode([
                'ok' => true,
                'collection_id' => $collection->id,
                'collection_name' => $collection->name,
                'url' => route('collections.show', $collection),
                'collection_created' => $collectionCreated,
                'fields_created' => $summary['fields_created'],
                'mapped_headers' => $summary['mapped_headers'],
                'created' => $summary['created'],
                'updated' => $summary['updated'],
                'skipped' => $summary['skipped'],
                'errors' => $summary['errors'],
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
        });
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'attachment_id' => $schema->string()->required()->description('UUID of the uploaded AI chat attachment'),
            'collection_id' => $schema->integer()->description('Target collection id (optional if collection_name is set)'),
            'collection_name' => $schema->string()->description(
                'Collection name: find existing or create new when collection_id is omitted'
            ),
            'upsert_key' => $schema->string()->description('Optional field name used to update matching items instead of creating duplicates'),
            'dry_run' => $schema->boolean()->description('Preview inferred schema and sample rows without writing or deleting the attachment'),
            'async' => $schema->boolean()->description('Queue the import; imports over 200 rows are queued automatically'),
        ];
    }

    /**
     * @return list<array<string, string>>
     */
    private function readRows(string $absolutePath, string $originalName): array
    {
        if (strtolower(pathinfo($originalName, PATHINFO_EXTENSION)) === 'xlsx') {
            $sheetRows = IOFactory::load($absolutePath)->getActiveSheet()->toArray(null, true, true, false);

            return $this->rowsFromMatrix($sheetRows);
        }

        $handle = fopen($absolutePath, 'rb');

        if ($handle === false) {
            throw new \RuntimeException('apertura file fallita');
        }

        try {
            $headerRow = fgetcsv($handle, null, ',', '"', '\\');

            if ($headerRow === false || $headerRow === [null] || $headerRow === []) {
                throw new \RuntimeException('CSV vuoto o senza intestazioni');
            }

            $matrix = [$headerRow];

            while (($row = fgetcsv($handle, null, ',', '"', '\\')) !== false) {
                if (count($matrix) > self::MAX_ROWS) {
                    break;
                }

                $matrix[] = $row;
            }

            return $this->rowsFromMatrix($matrix);
        } finally {
            fclose($handle);
        }
    }

    /**
     * @param  list<array<int, mixed>>  $matrix
     * @return list<array<string, string>>
     */
    private function rowsFromMatrix(array $matrix): array
    {
        $headers = array_map(fn (mixed $header): string => trim((string) $header), array_shift($matrix) ?? []);

        if ($headers === [] || array_filter($headers) === []) {
            throw new \RuntimeException('File vuoto o senza intestazioni');
        }

        $rows = [];

        foreach (array_slice($matrix, 0, self::MAX_ROWS) as $matrixRow) {
            $row = [];

            foreach ($headers as $columnIndex => $header) {
                if ($header !== '') {
                    $row[$header] = trim((string) ($matrixRow[$columnIndex] ?? ''));
                }
            }

            if (! $this->associativeRowIsEmpty($row)) {
                $rows[] = $row;
            }
        }

        if ($rows === []) {
            throw new \RuntimeException('Nessuna riga dati trovata');
        }

        return $rows;
    }
}
