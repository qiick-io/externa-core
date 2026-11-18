<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Models\File;
use App\Traits\HasFilesTrait;
use Illuminate\Support\Facades\DB;

/**
 * Links file-manager files to any model that uses {@see HasFilesTrait}, optionally by pivot role.
 */
class FileAttachmentService
{
    /**
     * Attach a file to a model using the HasFilesTrait trait.
     *
     * @throws \InvalidArgumentException When the model class or instance is invalid
     */
    public function attachToModel(File $file, string $modelType, int $modelId, ?string $role = null, int $order = 0): void
    {
        DB::transaction(function () use ($file, $modelType, $modelId, $role, $order) {
            if (! class_exists($modelType)) {
                throw new \InvalidArgumentException("Model class '{$modelType}' does not exist.");
            }

            $model = $modelType::query()->find($modelId);
            if (! $model) {
                throw new \InvalidArgumentException("Model '{$modelType}' with ID {$modelId} not found.");
            }

            if (! in_array(HasFilesTrait::class, class_uses_recursive($modelType), true)) {
                throw new \InvalidArgumentException("Model '{$modelType}' does not use HasFilesTrait trait.");
            }

            $model->attachFile($file, $role, $order);
        });
    }

    /**
     * Detach a file from a model, optionally scoped to a pivot role.
     *
     * @throws \InvalidArgumentException When the model class or instance is invalid
     */
    public function detachFromModel(File $file, string $modelType, int $modelId, ?string $role = null): void
    {
        DB::transaction(function () use ($file, $modelType, $modelId, $role) {
            if (! class_exists($modelType)) {
                throw new \InvalidArgumentException("Model class '{$modelType}' does not exist.");
            }

            $model = $modelType::query()->find($modelId);
            if (! $model) {
                throw new \InvalidArgumentException("Model '{$modelType}' with ID {$modelId} not found.");
            }

            if (! in_array(HasFilesTrait::class, class_uses_recursive($modelType), true)) {
                throw new \InvalidArgumentException("Model '{$modelType}' does not use HasFilesTrait trait.");
            }

            $model->detachFile($file, $role);
        });
    }
}
