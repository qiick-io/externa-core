<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Services\FileService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ManageFiles implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    public function description(): Stringable|string
    {
        return 'Search/list files and folders; create folders; rename; move; soft-delete; restore; force-delete. Uses the app file manager.';
    }

    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            $action = (string) $request->string('action');

            return match ($action) {
                'list', 'search' => $this->search($request),
                'create_folder' => $this->createFolder($request),
                'rename' => $this->rename($request),
                'move' => $this->move($request),
                'delete' => $this->softDelete($request->integer('file_id')),
                'restore' => $this->restore($request->integer('file_id')),
                'force_delete' => $this->forceDelete($request->integer('file_id')),
                default => 'Error: Unknown action. Use list, search, create_folder, rename, move, delete, restore, or force_delete.',
            };
        });
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required(),
            'file_id' => $schema->integer(),
            'parent_id' => $schema->integer(),
            'target_parent_id' => $schema->integer(),
            'name' => $schema->string(),
            'query' => $schema->string(),
            'include_trashed' => $schema->boolean(),
            'limit' => $schema->integer(),
        ];
    }

    private function search(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanShowFiles)) {
            return $error;
        }

        $limit = min(max($request->integer('limit', 50), 1), 100);
        $query = $request->boolean('include_trashed')
            ? File::query()->withTrashed()
            : File::query();

        if ($request->filled('parent_id')) {
            $query->where('parent_id', $request->integer('parent_id'));
        } elseif (! $request->filled('query')) {
            $query->whereNull('parent_id');
        }

        if ($request->filled('query')) {
            $term = '%'.trim((string) $request->string('query')).'%';
            $query->where(function ($inner) use ($term): void {
                $inner->where('name', 'like', $term)
                    ->orWhere('path', 'like', $term);
            });
        }

        $files = $query
            ->orderBy('type')
            ->orderBy('name')
            ->limit($limit)
            ->get(['id', 'parent_id', 'type', 'name', 'path', 'disk', 'deleted_at']);

        return json_encode(['files' => $files], JSON_PRETTY_PRINT) ?: '[]';
    }

    private function createFolder(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateFiles)) {
            return $error;
        }

        $name = trim((string) $request->string('name'));

        if ($name === '') {
            return 'Error: name is required.';
        }

        $parentId = $request->filled('parent_id') ? $request->integer('parent_id') : null;
        $folder = app(FileService::class)->createFolder($name, $parentId);
        $this->logAiMutation($folder, 'create_folder');

        return json_encode([
            'ok' => true,
            'file' => $folder->only(['id', 'parent_id', 'type', 'name', 'path']),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function rename(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditFiles)) {
            return $error;
        }

        $file = File::query()->find($request->integer('file_id'));

        if ($file === null) {
            return 'Error: File not found.';
        }

        $name = trim((string) $request->string('name'));

        if ($name === '') {
            return 'Error: name is required.';
        }

        $file = app(FileService::class)->rename($file, $name);
        $this->logAiMutation($file, 'rename_file');

        return json_encode([
            'ok' => true,
            'file' => $file->only(['id', 'parent_id', 'type', 'name', 'path']),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function move(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditFiles)) {
            return $error;
        }

        $file = File::query()->find($request->integer('file_id'));

        if ($file === null) {
            return 'Error: File not found.';
        }

        $targetParentId = $request->filled('target_parent_id')
            ? $request->integer('target_parent_id')
            : null;

        try {
            $file = app(FileService::class)->move($file, $targetParentId);
        } catch (\Throwable $exception) {
            return 'Error: '.$exception->getMessage();
        }

        $this->logAiMutation($file, 'move_file');

        return json_encode([
            'ok' => true,
            'file' => $file->only(['id', 'parent_id', 'type', 'name', 'path']),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function softDelete(int $fileId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanDeleteFiles)) {
            return $error;
        }

        $file = File::query()->find($fileId);

        if ($file === null) {
            return 'Error: File not found.';
        }

        $summary = $file->only(['id', 'name', 'path', 'type']);
        $this->logAiMutation($file, 'soft_delete_file');
        app(FileService::class)->softDelete($file);

        return json_encode(['ok' => true, 'deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function restore(int $fileId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanRestoreFiles)) {
            return $error;
        }

        $file = File::query()->onlyTrashed()->find($fileId);

        if ($file === null) {
            return 'Error: Trashed file not found.';
        }

        $file = app(FileService::class)->restore($file);
        $this->logAiMutation($file, 'restore_file');

        return json_encode([
            'ok' => true,
            'file' => $file->only(['id', 'parent_id', 'type', 'name', 'path', 'deleted_at']),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function forceDelete(int $fileId): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanForceDeleteFiles)) {
            return $error;
        }

        $file = File::query()->withTrashed()->find($fileId);

        if ($file === null) {
            return 'Error: File not found.';
        }

        $summary = $file->only(['id', 'name', 'path', 'type']);
        $this->logAiMutation($file, 'force_delete_file');
        app(FileService::class)->forceDelete($file);

        return json_encode(['ok' => true, 'force_deleted' => $summary], JSON_PRETTY_PRINT) ?: '{}';
    }
}
