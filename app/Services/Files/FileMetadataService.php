<?php

declare(strict_types=1);

namespace App\Services\Files;

use App\Models\File;
use App\Models\User;
use App\Services\FileTransformService;
use App\Services\Security\PlainTextSanitizerService;
use App\Services\Webhooks\OutboundWebhookDispatcherService;
use Illuminate\Support\Facades\DB;

/**
 * Descriptive data on file-manager nodes: editable metadata and access, tags and per-user favorites.
 */
class FileMetadataService
{
    public function __construct(
        private readonly FilePrivacyDiskService $privacyDisks,
    ) {}

    /**
     * Apply the allowed metadata keys; text keys are sanitized.
     *
     * Side effects: clears cached transforms when the focal point moves, reconciles privacy disks
     * when `access` is present and dispatches the `file.updated` webhook.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function updateMetadata(File $file, array $attributes): File
    {
        $accessChanged = array_key_exists('access', $attributes);

        $updated = DB::transaction(function () use ($file, $attributes) {
            $allowed = [
                'title',
                'description',
                'location',
                'download_name',
                'focal_point_x',
                'focal_point_y',
                'translate_x',
                'translate_y',
                'scale',
                'access',
            ];

            $textKeys = ['title', 'description', 'location', 'download_name'];
            $focalChanged = false;
            foreach ($allowed as $key) {
                if (array_key_exists($key, $attributes)) {
                    if (in_array($key, ['focal_point_x', 'focal_point_y'], true)
                        && (float) ($file->{$key} ?? 0) !== (float) ($attributes[$key] ?? 0)) {
                        $focalChanged = true;
                    }
                    $value = $attributes[$key];
                    if (in_array($key, $textKeys, true) && (is_string($value) || $value === null)) {
                        $value = PlainTextSanitizerService::sanitize($value);
                    }
                    $file->{$key} = $value;
                }
            }

            $file->save();

            if ($focalChanged) {
                app(FileTransformService::class)->clearTransforms($file);
            }

            return $file->fresh(['tags']);
        });

        if ($accessChanged) {
            $updated = $this->privacyDisks->reconcilePrivacyDisk($updated);
            if ($updated->isFolder()) {
                $this->privacyDisks->reconcileDescendantPrivacyDisks($updated);
            }
        }

        app(OutboundWebhookDispatcherService::class)->dispatchFile('file.updated', $updated);

        return $updated;
    }

    /**
     * @param  list<string>  $tagNames
     */
    public function syncTags(File $file, array $tagNames): File
    {
        $file->syncTags($this->normalizeTagNames($tagNames));

        return $file->fresh(['tags']);
    }

    /**
     * @param  list<int>  $fileIds
     * @param  list<string>  $tagNames
     * @return list<File>
     */
    public function bulkTag(array $fileIds, array $tagNames, bool $attach): array
    {
        $normalizedTagNames = $this->normalizeTagNames($tagNames);
        $files = File::query()->whereIn('id', $fileIds)->get();

        foreach ($files as $file) {
            if ($attach) {
                $file->attachTags($normalizedTagNames);
            } else {
                $file->detachTags($normalizedTagNames);
            }
        }

        return $files->map(fn (File $file): File => $file->fresh(['tags']))->all();
    }

    /**
     * Mark a file as favorited for the given user.
     */
    public function favorite(File $file, User $user): void
    {
        $file->favoritedBy()->syncWithoutDetaching([$user->id]);
    }

    /**
     * Remove a user's favorite marker from a file.
     */
    public function unfavorite(File $file, User $user): void
    {
        $file->favoritedBy()->detach($user->id);
    }

    /**
     * @param  list<int>  $fileIds
     * @return list<File>
     */
    public function bulkFavorite(array $fileIds, User $user, bool $favorite): array
    {
        $files = File::query()->whereIn('id', $fileIds)->get();

        foreach ($files as $file) {
            if ($favorite) {
                $this->favorite($file, $user);
            } else {
                $this->unfavorite($file, $user);
            }
        }

        return $files->all();
    }

    /**
     * Sanitized, non-empty, unique tag names.
     *
     * @param  list<string>  $tagNames
     * @return list<string>
     */
    private function normalizeTagNames(array $tagNames): array
    {
        return array_values(array_unique(array_filter(
            array_map(
                static fn (mixed $tagName): string => PlainTextSanitizerService::sanitize((string) $tagName) ?? '',
                $tagNames,
            ),
            static fn (string $tagName): bool => $tagName !== '',
        )));
    }
}
