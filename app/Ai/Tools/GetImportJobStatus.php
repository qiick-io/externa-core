<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissionsTrait;
use App\Ai\Concerns\LogsAiToolUseTrait;
use App\Enums\PermissionEnum;
use App\Jobs\ImportCollectionJob;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * AI tool that reports status for a collection import job.
 */
class GetImportJobStatus implements Tool
{
    use ChecksAiPermissionsTrait;
    use LogsAiToolUseTrait;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'Get queued collection import progress by job_id.';
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

            $status = ImportCollectionJob::status(trim((string) $request->string('job_id')));

            if ($status === null || $status['user_id'] !== $this->authenticatedUser()?->id) {
                return 'Error: Import job not found.';
            }

            unset($status['user_id']);

            return json_encode($status, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'job_id' => $schema->string()->required()->description('Import job UUID'),
        ];
    }
}
