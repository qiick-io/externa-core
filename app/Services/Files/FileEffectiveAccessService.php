<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Enums\FileAccessEnum;
use App\Models\File;
use Illuminate\Support\Facades\DB;

/**
 * Computes and maintains denormalized `files.effective_access`.
 *
 * `access` = override on the row (null inherits). `effective_access` = resolved
 * public|private used by list AuthZ hot paths.
 */
class FileEffectiveAccessService
{
    /**
     * Walk `access` / `parent_id` (never reads `effective_access`).
     */
    public function compute(File $file): FileAccessEnum
    {
        $node = $file;
        $guard = 0;

        while ($node !== null && $guard < 64) {
            if ($node->access instanceof FileAccessEnum) {
                return $node->access;
            }

            if ($node->parent_id === null) {
                break;
            }

            $node = $node->relationLoaded('parent')
                ? $node->parent
                : File::query()->find($node->parent_id);
            $guard++;
        }

        return FileAccessEnum::Public;
    }

    public function apply(File $file): void
    {
        $value = $this->compute($file)->value;
        if (($file->attributes['effective_access'] ?? null) === $value) {
            return;
        }

        $file->effective_access = $value;
    }

    /**
     * Recompute every descendant (BFS). Uses query updates to avoid event loops.
     */
    public function refreshDescendants(File $folder): void
    {
        $queue = [(int) $folder->id];

        while ($queue !== []) {
            $parentId = array_shift($queue);
            $children = File::query()
                ->where('parent_id', $parentId)
                ->get(['id', 'parent_id', 'access', 'type', 'effective_access']);

            foreach ($children as $child) {
                $value = $this->compute($child)->value;
                if (($child->attributes['effective_access'] ?? null) !== $value) {
                    File::query()->whereKey($child->id)->update(['effective_access' => $value]);
                }

                if ($child->isFolder()) {
                    $queue[] = (int) $child->id;
                }
            }
        }
    }

    /**
     * Idempotent full-table backfill (chunked).
     *
     * @return int Rows whose effective_access changed
     */
    public function backfillAll(int $chunkSize = 500): int
    {
        $changed = 0;

        File::query()
            ->toBase()
            ->orderBy('id')
            ->select(['id', 'parent_id', 'access', 'effective_access'])
            ->chunkById($chunkSize, function ($rows) use (&$changed): void {
                $byId = [];
                foreach ($rows as $row) {
                    $byId[(int) $row->id] = [
                        'parent_id' => $row->parent_id !== null ? (int) $row->parent_id : null,
                        'access' => is_string($row->access) && $row->access !== '' ? $row->access : null,
                        'effective_access' => is_string($row->effective_access) && $row->effective_access !== ''
                            ? $row->effective_access
                            : null,
                    ];
                }

                // Parents outside this chunk may be needed — resolve via memo + DB.
                $memo = [];
                $resolve = function (int $id) use (&$resolve, &$memo, &$byId): string {
                    if (isset($memo[$id])) {
                        return $memo[$id];
                    }

                    if (! isset($byId[$id])) {
                        $row = DB::table('files')->where('id', $id)->first(['id', 'parent_id', 'access']);
                        if ($row === null) {
                            return $memo[$id] = FileAccessEnum::Public->value;
                        }
                        $byId[$id] = [
                            'parent_id' => $row->parent_id !== null ? (int) $row->parent_id : null,
                            'access' => is_string($row->access) && $row->access !== '' ? $row->access : null,
                            'effective_access' => null,
                        ];
                    }

                    $row = $byId[$id];
                    if ($row['access'] !== null) {
                        return $memo[$id] = $row['access'];
                    }
                    if ($row['parent_id'] === null) {
                        return $memo[$id] = FileAccessEnum::Public->value;
                    }

                    return $memo[$id] = $resolve($row['parent_id']);
                };

                foreach ($rows as $row) {
                    $id = (int) $row->id;
                    $value = $resolve($id);
                    if (($byId[$id]['effective_access'] ?? null) === $value) {
                        continue;
                    }
                    DB::table('files')->where('id', $id)->update(['effective_access' => $value]);
                    $changed++;
                }
            });

        return $changed;
    }
}
