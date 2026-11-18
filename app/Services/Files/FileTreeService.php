<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Enums\FileTypeEnum;
use App\Models\File;
use App\Services\Security\PlainTextSanitizerService;
use App\Services\Uploads\ForbiddenUploadExtensionService;
use App\Services\Webhooks\OutboundWebhookDispatcherService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Folder tree of the file manager: create folders, move and rename nodes, keep display paths in sync.
 */
class FileTreeService
{
    public function __construct(
        private readonly FileStorageService $storage,
        private readonly FilePrivacyDiskService $privacyDisks,
    ) {}

    /**
     * Create a folder node and persist its computed path.
     *
     * Side effect: dispatches the `file.created` webhook.
     */
    public function createFolder(string $name, ?int $parentId = null, ?string $disk = null): File
    {
        $disk ??= FilesDiskService::default();

        $file = DB::transaction(function () use ($name, $parentId, $disk) {
            $file = File::query()->create([
                'parent_id' => $parentId,
                'type' => FileTypeEnum::Folder,
                'name' => $name,
                'path' => '/'.$name,
                'disk' => $disk,
                'storage_path' => null,
            ]);

            $file->path = $this->calculatePath($file);
            $file->save();

            return $file;
        });

        app(OutboundWebhookDispatcherService::class)->dispatchFile('file.created', $file);

        return $file;
    }

    /**
     * Move a file or folder, optionally across disks, with optimistic locking when version is supplied.
     *
     * Side effects: moves bytes between disks (rolled back on failure), recomputes effective access,
     * dispatches the `file.updated` webhook and reconciles privacy disks.
     *
     * @throws HttpResponseException When optimistic lock fails (409)
     * @throws \InvalidArgumentException When the target is the node itself or one of its descendants
     */
    public function move(File $file, ?int $targetParentId, ?string $targetDisk = null, ?Carbon $version = null): File
    {
        if ($targetParentId !== null) {
            $this->validateNotDescendant($file, $targetParentId);
        }

        $oldDisk = $file->disk;
        $newDisk = $targetDisk ?? $oldDisk;
        $oldStoragePath = $file->storage_path;
        $newStoragePath = null;
        $fileMoved = false;

        try {
            if ($oldDisk !== $newDisk && $file->isFile() && $file->storage_path) {
                $newStoragePath = $this->storage->generateStoragePath($file->name, $newDisk);
                $this->storage->movePhysicalFileBetweenDisks($file, $oldDisk, $newDisk, $oldStoragePath, $newStoragePath);
                $fileMoved = true;
            }

            $moved = DB::transaction(function () use ($file, $targetParentId, $newDisk, $newStoragePath, $fileMoved, $version) {
                if ($version !== null) {
                    $updated = File::query()
                        ->where('id', $file->id)
                        ->where('updated_at', $version)
                        ->update([
                            'parent_id' => $targetParentId,
                            'disk' => $newDisk,
                            'storage_path' => $fileMoved ? $newStoragePath : $file->storage_path,
                            'updated_at' => now(),
                        ]);

                    if ($updated === 0) {
                        throw new HttpResponseException(
                            response()->json(['message' => 'File has been modified by another operation. Please refresh and try again.'], 409)
                        );
                    }

                    $file = $file->fresh();
                } else {
                    $file->parent_id = $targetParentId;
                    $file->disk = $newDisk;
                    if ($fileMoved) {
                        $file->storage_path = $newStoragePath;
                    }
                    $file->save();
                }

                $file->path = $this->calculatePath($file);
                $file->save();

                if ($file->isFolder()) {
                    $this->updateChildrenPaths($file);
                }

                return $file->fresh();
            });

            // query()->update and path-only saves can skip access/parent dirty checks — force recompute.
            $this->syncEffectiveAccess($moved);

            app(OutboundWebhookDispatcherService::class)->dispatchFile('file.updated', $moved);

            $moved = $this->privacyDisks->reconcilePrivacyDisk($moved);
            if ($moved->isFolder()) {
                $this->privacyDisks->reconcileDescendantPrivacyDisks($moved);
            }

            return $moved;
        } catch (\Throwable $e) {
            if ($fileMoved && $oldStoragePath && $newStoragePath) {
                $oldStorage = Storage::disk($oldDisk);
                $newStorage = Storage::disk($newDisk);

                if ($newStorage->exists($newStoragePath)) {
                    $contents = $newStorage->get($newStoragePath);
                    if ($contents !== false) {
                        $oldStorage->put($oldStoragePath, $contents);
                        $newStorage->delete($newStoragePath);
                    }
                }
            }

            throw $e;
        }
    }

    /**
     * @param  list<int>  $fileIds
     * @return list<File>
     */
    public function bulkMove(array $fileIds, ?int $targetParentId): array
    {
        $moved = [];

        foreach (File::query()->whereIn('id', $fileIds)->get() as $file) {
            $moved[] = $this->move($file, $targetParentId);
        }

        return $moved;
    }

    /**
     * Rename a file or folder and recalculate descendant paths when needed.
     *
     * Side effect: dispatches the `file.updated` webhook.
     */
    public function rename(File $file, string $newName): File
    {
        $newName = PlainTextSanitizerService::sanitize($newName) ?? '';
        ForbiddenUploadExtensionService::assertAllowed($newName, 'name');

        $renamed = DB::transaction(function () use ($file, $newName) {
            $file->name = $newName;
            $file->path = $this->calculatePath($file);
            $file->save();

            if ($file->isFolder()) {
                $this->updateChildrenPaths($file);
            }

            return $file->fresh();
        });

        app(OutboundWebhookDispatcherService::class)->dispatchFile('file.updated', $renamed);

        return $renamed;
    }

    /**
     * Compute the display path from parent hierarchy and name.
     */
    public function calculatePath(File $file): string
    {
        if ($file->parent_id === null) {
            return '/'.$file->name;
        }

        // One query for the parent row (strict models forbid a lazy load here).
        $parent = $file->relationLoaded('parent') ? $file->parent : $file->parent()->first();
        if (! $parent) {
            return '/'.$file->name;
        }

        $parentPath = $parent->path;
        if ($parentPath === '/') {
            return '/'.$file->name;
        }

        return rtrim($parentPath, '/').'/'.$file->name;
    }

    /**
     * Recalculate and persist paths for all descendants after a folder move or rename.
     */
    public function updateChildrenPaths(File $folder): void
    {
        foreach ($folder->children as $child) {
            $child->path = $this->calculatePath($child);
            $child->save();

            if ($child->isFolder()) {
                $this->updateChildrenPaths($child);
            }
        }
    }

    /**
     * Persist denormalized effective_access for a node (and folder descendants).
     */
    private function syncEffectiveAccess(File $file): void
    {
        $service = app(FileEffectiveAccessService::class);
        $service->apply($file);
        File::query()->whereKey($file->id)->update([
            'effective_access' => $file->effective_access,
        ]);

        if ($file->isFolder()) {
            $service->refreshDescendants($file);
        }
    }

    /**
     * @throws \InvalidArgumentException When the target is the node itself or one of its descendants
     */
    private function validateNotDescendant(File $file, int $targetParentId): void
    {
        if ($targetParentId === $file->id) {
            throw new \InvalidArgumentException('Cannot move a file into itself.');
        }

        $target = File::query()->find($targetParentId);
        if (! $target) {
            return;
        }

        $current = $target;
        while ($current && $current->parent_id !== null) {
            if ($current->parent_id === $file->id) {
                throw new \InvalidArgumentException('Cannot move a folder into its own descendant.');
            }
            $current = $current->parent;
        }
    }
}
