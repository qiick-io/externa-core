<?php

namespace App\Ai\Tools;

use App\Ai\Concerns\ChecksAiPermissions;
use App\Ai\Concerns\LogsAiToolUse;
use App\Ai\Support\AiToolJsonDecoder;
use App\Enums\FileTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\AiChatAttachment;
use App\Models\File;
use App\Services\FileService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Http\UploadedFile;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * AI tool for browsing and mutating files and folders in the file manager.
 */
class ManageFiles implements Tool
{
    use ChecksAiPermissions;
    use LogsAiToolUse;

    /**
     * Describe what this tool does for the model.
     */
    public function description(): Stringable|string
    {
        return 'File manager tool. Actions: list/search, create_folder (alias create), rename, move (one file), move_many (bulk: file_ids_json OR source_parent_id into target_parent_id), delete, restore, force_delete, save_attachment. Prefer move_many when relocating multiple items. Never claim move is unavailable.';
    }

    /**
     * Execute the tool request and return a string result for the model.
     */
    public function handle(Request $request): Stringable|string
    {
        return $this->withAiToolLogging($request, function () use ($request): string {
            $action = (string) $request->string('action');

            return match ($action) {
                'list', 'search' => $this->search($request),
                'create', 'create_folder' => $this->createFolder($request),
                'rename' => $this->rename($request),
                'move' => $this->move($request),
                'move_many' => $this->moveMany($request),
                'delete' => $this->softDelete($request->integer('file_id')),
                'restore' => $this->restore($request->integer('file_id')),
                'force_delete' => $this->forceDelete($request->integer('file_id')),
                'save_attachment' => $this->saveAttachment($request),
                default => 'Error: Unknown action. Use list, search, create_folder, rename, move, move_many, delete, restore, force_delete, or save_attachment.',
            };
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'action' => $schema->string()->required()->description(
                'list|search|create_folder|create|rename|move|move_many|delete|restore|force_delete|save_attachment'
            ),
            'file_id' => $schema->integer()->description('Required for rename, move, delete, restore, force_delete'),
            'file_ids_json' => $schema->string()->description('JSON array of file ids for move_many, e.g. [1,2,3]'),
            'attachment_id' => $schema->string(),
            'parent_id' => $schema->integer()->description('Parent folder id for list/create_folder; 0 or omit = root'),
            'source_parent_id' => $schema->integer()->description('For move_many without file_ids_json: move all direct children of this folder; 0 = root'),
            'target_parent_id' => $schema->integer()->description('Destination folder id for move/move_many; 0 or omit = root'),
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

        $parentId = $request->filled('parent_id') ? $request->integer('parent_id') : null;
        if ($parentId !== null && $parentId <= 0) {
            $parentId = null;
        }

        if ($request->filled('parent_id')) {
            $query->where('parent_id', $parentId);
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
            ->get([
                'id',
                'parent_id',
                'type',
                'name',
                'path',
                'disk',
                'storage_path',
                'mime_type',
                'size',
                'deleted_at',
            ]);

        return json_encode([
            'ok' => true,
            'files' => $files->map(fn (File $file): array => $this->serializeFile($file))->values(),
            'url' => route('files.index', array_filter([
                'folder' => $parentId,
            ])),
        ], JSON_PRETTY_PRINT) ?: '[]';
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

        // Models often pass parent_id=0 for root; treat non-positive as null.
        $parentId = $request->filled('parent_id') ? $request->integer('parent_id') : null;
        if ($parentId !== null && $parentId <= 0) {
            $parentId = null;
        }
        $folder = app(FileService::class)->createFolder($name, $parentId);
        $this->logAiMutation($folder, 'create_folder');

        return json_encode([
            'ok' => true,
            'file' => $this->serializeFile($folder),
            'url' => route('files.index', array_filter(['folder' => $folder->parent_id])),
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
            'file' => $this->serializeFile($file),
            'url' => route('files.index', array_filter(['folder' => $file->parent_id])),
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

        // Models often pass 0 for root.
        if ($targetParentId !== null && $targetParentId <= 0) {
            $targetParentId = null;
        }

        try {
            $file = app(FileService::class)->move($file, $targetParentId);
        } catch (\Throwable $exception) {
            return 'Error: '.$exception->getMessage();
        }

        $this->logAiMutation($file, 'move_file');

        return json_encode([
            'ok' => true,
            'file' => $this->serializeFile($file),
            'url' => route('files.index', array_filter(['folder' => $file->parent_id])),
        ], JSON_PRETTY_PRINT) ?: '{}';
    }

    private function moveMany(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanEditFiles)) {
            return $error;
        }

        $targetParentId = $request->filled('target_parent_id')
            ? $request->integer('target_parent_id')
            : null;

        if ($targetParentId !== null && $targetParentId <= 0) {
            $targetParentId = null;
        }

        if (
            $targetParentId !== null
            && File::query()
                ->whereKey($targetParentId)
                ->where('type', FileTypeEnum::Folder)
                ->doesntExist()
        ) {
            return 'Error: target_parent_id must be an existing folder.';
        }

        $ids = AiToolJsonDecoder::optionalArrayFrom($request, 'file_ids_json');

        if (is_string($ids)) {
            return $ids;
        }

        if ($ids === null) {
            if (! $request->filled('source_parent_id') && ! array_key_exists('source_parent_id', $request->all())) {
                return 'Error: move_many requires file_ids_json or source_parent_id.';
            }

            $sourceParentId = $request->filled('source_parent_id')
                ? $request->integer('source_parent_id')
                : null;

            if ($sourceParentId !== null && $sourceParentId <= 0) {
                $sourceParentId = null;
            }

            $query = File::query();

            if ($sourceParentId === null) {
                $query->whereNull('parent_id');
            } else {
                $query->where('parent_id', $sourceParentId);
            }

            if ($targetParentId !== null) {
                $query->where('id', '!=', $targetParentId);
            }

            $ids = $query->orderBy('id')->pluck('id')->all();
        }

        $fileIds = collect($ids)
            ->map(fn (mixed $value): int => (int) $value)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values();

        if ($fileIds->isEmpty()) {
            return json_encode([
                'ok' => true,
                'moved' => [],
                'skipped' => [],
                'message' => 'Nothing to move.',
                'url' => route('files.index', array_filter(['folder' => $targetParentId])),
            ], JSON_PRETTY_PRINT) ?: '{}';
        }

        $moved = [];
        $skipped = [];
        $fileService = app(FileService::class);

        foreach ($fileIds as $fileId) {
            if ($targetParentId !== null && $fileId === $targetParentId) {
                $skipped[] = ['id' => $fileId, 'reason' => 'Cannot move a folder into itself.'];

                continue;
            }

            $file = File::query()->find($fileId);

            if ($file === null) {
                $skipped[] = ['id' => $fileId, 'reason' => 'Not found.'];

                continue;
            }

            if ($file->parent_id === $targetParentId) {
                $skipped[] = ['id' => $fileId, 'reason' => 'Already in target.'];

                continue;
            }

            try {
                $file = $fileService->move($file, $targetParentId);
            } catch (\Throwable $exception) {
                $skipped[] = ['id' => $fileId, 'reason' => $exception->getMessage()];

                continue;
            }

            $this->logAiMutation($file, 'move_file');
            $moved[] = $this->serializeFile($file);
        }

        return json_encode([
            'ok' => $moved !== [] || $skipped === [],
            'moved' => $moved,
            'skipped' => $skipped,
            'files' => $moved,
            'url' => route('files.index', array_filter(['folder' => $targetParentId])),
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
            'file' => $this->serializeFile($file),
            'url' => route('files.index', array_filter(['folder' => $file->parent_id])),
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

    private function saveAttachment(Request $request): string
    {
        if ($error = $this->requirePermission(PermissionEnum::CanCreateFiles)) {
            return $error;
        }

        $attachment = AiChatAttachment::query()
            ->whereKey(trim((string) $request->string('attachment_id')))
            ->where('user_id', $this->authenticatedUser()?->id)
            ->first();

        if ($attachment === null) {
            return 'Error: Attachment not found or not owned by you.';
        }

        if ($attachment->isExpired()) {
            $attachment->delete();

            return 'Error: Attachment expired. Upload it again.';
        }

        $parentId = $request->filled('parent_id') ? $request->integer('parent_id') : null;
        $uploadedFile = new UploadedFile(
            $attachment->absolutePath(),
            $attachment->original_name,
            $attachment->mime_type,
            null,
            true,
        );
        $file = app(FileService::class)->uploadFile($uploadedFile, $parentId, 'assets');
        $this->logAiMutation($file, 'save_ai_attachment');
        $attachment->delete();

        return json_encode([
            'ok' => true,
            'file' => $this->serializeFile($file),
            'url' => route('files.index', array_filter(['folder' => $file->parent_id])),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) ?: '{}';
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeFile(File $file): array
    {
        return [
            'id' => $file->id,
            'parent_id' => $file->parent_id,
            'type' => $file->type instanceof \BackedEnum ? $file->type->value : $file->type,
            'name' => $file->name,
            'path' => $file->path,
            'disk' => $file->disk,
            'storage_path' => $file->storage_path,
            'mime_type' => $file->mime_type,
            'size' => $file->size,
            'deleted_at' => $file->deleted_at?->toIso8601String(),
            'url' => route('files.index', array_filter(['folder' => $file->parent_id])),
        ];
    }
}
