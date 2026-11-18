<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Models\File;

/**
 * Prepares a single file for a FileResource response after a write.
 *
 * List queries compute `is_favorited` with a `withExists` subquery; a file returned by a
 * write (rename, move, replace, …) has no such column, so it is looked up here.
 */
class FileFavoriteFlagService
{
    /**
     * Load tags and set the favorite flag for the given user when there is one.
     */
    public function withFavoriteFlag(File $file, ?int $userId): File
    {
        $file->loadMissing('tags');

        if ($userId !== null) {
            $file->is_favorited = $file->favoritedBy()->where('user_id', $userId)->exists();
        }

        return $file;
    }
}
