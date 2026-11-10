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
     * Recompute every descendant, one tree level at a time: each level's
     * children are loaded with one query per 500 parents, inherit their
     * parent's resolved value unless they override `access`, and are written
     * with one update per value. Query updates avoid model event loops.
     */
    public function refreshDescendants(File $folder): void
    {
        /** @var array<int, string> $effectiveByParent */
        $effectiveByParent = [(int) $folder->id => $this->compute($folder)->value];

        while ($effectiveByParent !== []) {
            $nextLevel = [];
            $idsByValue = [];

            foreach (array_chunk(array_keys($effectiveByParent), 500) as $parentIds) {
                // Partial select: skip the default currentVersion eager load, it needs current_version_id.
                $children = File::query()
                    ->without('currentVersion')
                    ->whereIn('parent_id', $parentIds)
                    ->get(['id', 'parent_id', 'access', 'type', 'effective_access']);

                foreach ($children as $child) {
                    $value = $child->access instanceof FileAccessEnum
                        ? $child->access->value
                        : $effectiveByParent[(int) $child->parent_id];

                    if ($child->getRawOriginal('effective_access') !== $value) {
                        $idsByValue[$value][] = (int) $child->id;
                    }

                    if ($child->isFolder()) {
                        $nextLevel[(int) $child->id] = $value;
                    }
                }
            }

            $this->writeEffectiveAccess($idsByValue);
            $effectiveByParent = $nextLevel;
        }
    }

    /**
     * Idempotent full-table backfill (chunked). Ancestors outside a chunk are
     * loaded level by level with `whereIn` (not one query per row), and the
     * chunk's changes are written with one update per value.
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
                /** @var array<int, array{parent_id: int|null, access: string|null, effective_access: string|null}> $byId */
                $byId = [];
                foreach ($rows as $row) {
                    $byId[(int) $row->id] = $this->accessRow($row);
                }

                $this->loadMissingAncestors($byId);

                $memo = [];
                $resolve = function (int $id) use (&$resolve, &$memo, &$byId): string {
                    if (isset($memo[$id])) {
                        return $memo[$id];
                    }

                    $row = $byId[$id] ?? null;
                    if ($row === null || ($row['access'] === null && $row['parent_id'] === null)) {
                        return $memo[$id] = $row['access'] ?? FileAccessEnum::Public->value;
                    }
                    if ($row['access'] !== null) {
                        return $memo[$id] = $row['access'];
                    }

                    return $memo[$id] = $resolve($row['parent_id']);
                };

                $idsByValue = [];
                foreach ($rows as $row) {
                    $id = (int) $row->id;
                    $value = $resolve($id);
                    if ($byId[$id]['effective_access'] !== $value) {
                        $idsByValue[$value][] = $id;
                        $changed++;
                    }
                }

                $this->writeEffectiveAccess($idsByValue);
            });

        return $changed;
    }

    /**
     * Adds every ancestor of the rows in `$byId` that is not loaded yet, one
     * `whereIn` query per tree level. Ids that no longer exist resolve as root
     * rows without an override (public), as before.
     *
     * @param  array<int, array{parent_id: int|null, access: string|null, effective_access: string|null}>  $byId
     */
    private function loadMissingAncestors(array &$byId): void
    {
        $guard = 0;

        while ($guard++ < 64) {
            $missing = [];
            foreach ($byId as $row) {
                if ($row['access'] === null && $row['parent_id'] !== null && ! isset($byId[$row['parent_id']])) {
                    $missing[$row['parent_id']] = true;
                }
            }

            if ($missing === []) {
                return;
            }

            foreach (array_chunk(array_keys($missing), 500) as $ids) {
                $found = DB::table('files')->whereIn('id', $ids)->get(['id', 'parent_id', 'access']);
                foreach ($found as $row) {
                    $byId[(int) $row->id] = $this->accessRow($row);
                }
                foreach ($ids as $id) {
                    $byId[$id] ??= ['parent_id' => null, 'access' => null, 'effective_access' => null];
                }
            }
        }
    }

    /**
     * @return array{parent_id: int|null, access: string|null, effective_access: string|null}
     */
    private function accessRow(object $row): array
    {
        $effective = $row->effective_access ?? null;

        return [
            'parent_id' => $row->parent_id !== null ? (int) $row->parent_id : null,
            'access' => is_string($row->access) && $row->access !== '' ? $row->access : null,
            'effective_access' => is_string($effective) && $effective !== '' ? $effective : null,
        ];
    }

    /**
     * One query update per resolved value.
     *
     * @param  array<string, list<int>>  $idsByValue
     */
    private function writeEffectiveAccess(array $idsByValue): void
    {
        foreach ($idsByValue as $value => $ids) {
            foreach (array_chunk($ids, 500) as $chunk) {
                DB::table('files')->whereIn('id', $chunk)->update(['effective_access' => $value]);
            }
        }
    }
}
