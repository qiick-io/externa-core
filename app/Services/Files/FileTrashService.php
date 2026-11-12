<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Models\File;
use App\Services\FileTransformService;
use App\Services\Webhooks\OutboundWebhookDispatcherService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Trash lifecycle of file-manager nodes: soft delete, restore and permanent delete, always for the
 * whole subtree.
 */
class FileTrashService
{
    /**
     * Soft-delete a file or folder and all descendants recursively.
     *
     * Side effect: dispatches the `file.deleted` webhook for every node.
     */
    public function softDelete(File $file): void
    {
        DB::transaction(function () use ($file) {
            foreach ($file->children as $child) {
                $this->softDelete($child);
            }

            $file->delete();
        });

        app(OutboundWebhookDispatcherService::class)->dispatchFile('file.deleted', $file);
    }

    /**
     * Restore a soft-deleted file or folder and its trashed descendants.
     */
    public function restore(File $file): File
    {
        return DB::transaction(function () use ($file) {
            $file->restore();

            foreach (File::query()->onlyTrashed()->where('parent_id', $file->id)->get() as $child) {
                $this->restore($child);
            }

            return $file->fresh();
        });
    }

    /**
     * Permanently delete a file or folder tree and remove storage bytes.
     *
     * Side effects: clears cached transforms, deletes the stored bytes and dispatches the
     * `file.deleted` webhook for every node.
     */
    public function forceDelete(File $file): void
    {
        DB::transaction(function () use ($file) {
            foreach (File::query()->withTrashed()->where('parent_id', $file->id)->get() as $child) {
                $this->forceDelete($child);
            }

            if ($file->isFile() && $file->storage_path) {
                app(FileTransformService::class)->clearTransforms($file);
                Storage::disk($file->disk)->delete($file->storage_path);
            }

            $file->forceDelete();
        });

        app(OutboundWebhookDispatcherService::class)->dispatchFile('file.deleted', $file);
    }

    /**
     * @param  list<int>  $fileIds
     */
    public function bulkSoftDelete(array $fileIds): void
    {
        foreach (File::query()->whereIn('id', $fileIds)->get() as $file) {
            $this->softDelete($file);
        }
    }

    /**
     * @param  list<int>  $fileIds
     */
    public function bulkRestore(array $fileIds): void
    {
        foreach (File::query()->onlyTrashed()->whereIn('id', $fileIds)->get() as $file) {
            $this->restore($file);
        }
    }

    /**
     * @param  list<int>  $fileIds
     */
    public function bulkForceDelete(array $fileIds): void
    {
        foreach (File::query()->withTrashed()->whereIn('id', $fileIds)->get() as $file) {
            $this->forceDelete($file);
        }
    }
}
