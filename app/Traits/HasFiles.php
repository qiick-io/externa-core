<?php

namespace App\Traits;

use App\Models\File;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Collection;

/**
 * @mixin Model
 */
trait HasFiles
{
    /**
     * @return MorphToMany<File, $this>
     */
    public function files(): MorphToMany
    {
        return $this->morphToMany(File::class, 'fileable', 'fileables')
            ->withPivot(['role', 'order'])
            ->orderByPivot('order')
            ->withTimestamps();
    }

    public function attachFile(File $file, ?string $role = null, int $order = 0): void
    {
        $pivot = [
            'role' => $role,
            'order' => $order,
        ];

        if ($role !== null && $role !== '') {
            $existsForRole = $this->files()
                ->where('files.id', $file->id)
                ->wherePivot('role', $role)
                ->exists();

            if ($existsForRole) {
                $this->files()->wherePivot('role', $role)->updateExistingPivot($file->id, $pivot);

                return;
            }

            $this->files()->attach($file->id, $pivot);

            return;
        }

        $this->files()->syncWithoutDetaching([
            $file->id => $pivot,
        ]);
    }

    public function detachFile(File $file, ?string $role = null): void
    {
        $relation = $this->files();

        if ($role !== null && $role !== '') {
            $relation->wherePivot('role', $role);
        }

        $relation->detach($file->id);
    }

    public function updateFile(File $file, ?string $role = null, int $order = 0): void
    {
        $pivot = [
            'role' => $role,
            'order' => $order,
        ];

        if ($role !== null && $role !== '') {
            if ($this->files()->where('files.id', $file->id)->wherePivot('role', $role)->exists()) {
                $this->files()->wherePivot('role', $role)->updateExistingPivot($file->id, $pivot);
            } else {
                $this->files()->attach($file->id, $pivot);
            }

            return;
        }

        if ($this->files()->where('files.id', $file->id)->exists()) {
            $this->files()->updateExistingPivot($file->id, $pivot);
        } else {
            $this->files()->attach($file->id, $pivot);
        }
    }

    /**
     * @param  array<int|array{role?: string|null, order?: int}>  $fileIdsWithPivotData
     */
    public function syncFiles(array $fileIdsWithPivotData): void
    {
        $syncData = [];
        foreach ($fileIdsWithPivotData as $key => $value) {
            if (is_array($value)) {
                $syncData[$key] = [
                    'role' => $value['role'] ?? null,
                    'order' => $value['order'] ?? 0,
                ];
            } else {
                $syncData[$value] = [
                    'role' => null,
                    'order' => 0,
                ];
            }
        }

        $this->files()->sync($syncData);
    }

    /**
     * @return Collection<int, File>
     */
    public function filesByRole(string $role): Collection
    {
        return $this->files()
            ->wherePivot('role', $role)
            ->get();
    }

    public function firstFileByRole(string $role): ?File
    {
        return $this->files()
            ->wherePivot('role', $role)
            ->first();
    }
}
