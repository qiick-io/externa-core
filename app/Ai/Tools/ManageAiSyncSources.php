<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Ai\Support\SafeRemoteUrlValidator;
use App\Enums\PermissionEnum;
use App\Models\AiSyncSource;
use App\Models\Collection;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * AI tool for configuring and inspecting AI sync sources.
 */
class ManageAiSyncSources implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'List, create, update, enable, disable, or delete scheduled remote JSON collection sync sources.';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            $action = trim((string) $request->string('action'));
            $permission = in_array($action, ['list', 'create'], true)
                ? PermissionEnum::CanCreateCollections
                : PermissionEnum::CanEditCollections;

            if ($error = $this->requirePermission($permission)) {
                return $error;
            }

            return match ($action) {
                'list' => $this->listSources(),
                'create' => $this->createSource($request),
                'update' => $this->updateSource($request),
                'enable' => $this->setEnabled($request, true),
                'disable' => $this->setEnabled($request, false),
                'delete' => $this->deleteSource($request),
                default => 'Error: action deve essere list|create|update|enable|disable|delete.',
            };
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required()->description('list|create|update|enable|disable|delete'),
            'source_id' => $schema->integer(),
            'collection_id' => $schema->integer(),
            'url' => $schema->string(),
            'upsert_key' => $schema->string(),
            'interval_minutes' => $schema->integer()->description('Minimum 1 minute'),
            'auth_bearer' => $schema->string()->description('Optional encrypted Bearer token'),
        ];
    }

    private function listSources(): string
    {
        $sources = AiSyncSource::query()
            ->where('user_id', $this->authenticatedUser()?->id)
            ->latest('id')
            ->get()
            ->makeHidden('auth_bearer');

        return json_encode(['sources' => $sources], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    private function createSource(Request $request): string
    {
        $url = trim((string) $request->string('url'));

        if ($error = SafeRemoteUrlValidator::validate($url)) {
            return $error;
        }

        $collection = Collection::query()->find($request->integer('collection_id'));

        if ($collection === null) {
            return 'Error: Collezione non trovata.';
        }

        $source = AiSyncSource::query()->create([
            'user_id' => $this->authenticatedUser()?->id,
            'collection_id' => $collection->id,
            'url' => $url,
            'upsert_key' => trim((string) $request->string('upsert_key')) ?: null,
            'interval_minutes' => max(1, $request->integer('interval_minutes', 60)),
            'auth_bearer' => trim((string) $request->string('auth_bearer')) ?: null,
            'enabled' => true,
        ]);

        return $this->sourceJson($source);
    }

    private function updateSource(Request $request): string
    {
        $source = $this->ownedSource($request);

        if (is_string($source)) {
            return $source;
        }

        $attributes = [];

        if ($request->filled('url')) {
            $url = trim((string) $request->string('url'));

            if ($error = SafeRemoteUrlValidator::validate($url)) {
                return $error;
            }

            $attributes['url'] = $url;
        }

        if ($request->filled('upsert_key')) {
            $attributes['upsert_key'] = trim((string) $request->string('upsert_key')) ?: null;
        }

        if ($request->filled('interval_minutes')) {
            $attributes['interval_minutes'] = max(1, $request->integer('interval_minutes'));
        }

        if ($request->filled('auth_bearer')) {
            $attributes['auth_bearer'] = trim((string) $request->string('auth_bearer')) ?: null;
        }

        if ($attributes === []) {
            return 'Error: Nessun campo da aggiornare.';
        }

        $source->update($attributes);

        return $this->sourceJson($source->fresh());
    }

    private function setEnabled(Request $request, bool $enabled): string
    {
        $source = $this->ownedSource($request);

        if (is_string($source)) {
            return $source;
        }

        $source->update(['enabled' => $enabled]);

        return $this->sourceJson($source->fresh());
    }

    private function deleteSource(Request $request): string
    {
        $source = $this->ownedSource($request);

        if (is_string($source)) {
            return $source;
        }

        $source->delete();

        return json_encode(['ok' => true, 'deleted' => $source->id], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function ownedSource(Request $request): AiSyncSource|string
    {
        $source = AiSyncSource::query()
            ->where('user_id', $this->authenticatedUser()?->id)
            ->find($request->integer('source_id'));

        return $source ?? 'Error: Sorgente sync non trovata.';
    }

    private function sourceJson(AiSyncSource $source): string
    {
        return json_encode([
            'ok' => true,
            'source' => $source->makeHidden('auth_bearer'),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }
}
