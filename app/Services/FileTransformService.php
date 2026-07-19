<?php

namespace App\Services;

use App\Models\File;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Generates and caches contain-fit image thumbnails on the file disk.
 */
class FileTransformService
{
    public const DEFAULT_SIZE = 128;

    public const MAX_SIZE = 256;

    /**
     * @var list<int>
     */
    private const CLEANUP_SIZES = [64, 128, 256];

    /**
     * Whether the file is a raster image eligible for thumbnail generation.
     */
    public function isImage(File $file): bool
    {
        return $file->isFile()
            && is_string($file->mime_type)
            && str_starts_with($file->mime_type, 'image/')
            && $file->mime_type !== 'image/svg+xml';
    }

    /**
     * Clamp requested thumbnail edge length to configured bounds.
     */
    public function clampSize(?int $size): int
    {
        $resolved = $size ?? self::DEFAULT_SIZE;

        if ($resolved < 1) {
            $resolved = self::DEFAULT_SIZE;
        }

        return min($resolved, self::MAX_SIZE);
    }

    /**
     * Ensure a contain-fit thumbnail exists and return its storage path.
     */
    public function ensureThumbnail(File $file, ?int $size = null): string
    {
        if (! $this->isImage($file) || ! $file->storage_path) {
            throw new RuntimeException('Thumbnails are only available for image files.');
        }

        $size = $this->clampSize($size);
        $disk = Storage::disk($file->disk);

        foreach (['webp', 'jpg'] as $extension) {
            $existingPath = $this->cachePath($file, $size, $extension);

            if ($disk->exists($existingPath)) {
                return $existingPath;
            }
        }

        if (! $disk->exists($file->storage_path)) {
            throw new RuntimeException('Source file is missing from storage.');
        }

        $contents = $disk->get($file->storage_path);

        if ($contents === false || $contents === '') {
            throw new RuntimeException('Unable to read source image.');
        }

        $encoded = $this->resizeContain($contents, $size);
        $cachePath = $this->cachePath($file, $size, $encoded['extension']);
        $disk->put($cachePath, $encoded['binary']);

        return $cachePath;
    }

    /**
     * Remove cached transform files for the given file across standard sizes.
     */
    public function clearTransforms(File $file): void
    {
        if (! $file->storage_path) {
            return;
        }

        $disk = Storage::disk($file->disk);

        foreach (self::CLEANUP_SIZES as $size) {
            foreach (['webp', 'jpg'] as $extension) {
                $path = $this->cachePath($file, $size, $extension);

                if ($disk->exists($path)) {
                    $disk->delete($path);
                }
            }
        }
    }

    /**
     * Public storage URL for the file's current bytes, or null for folders.
     */
    public function publicUrl(File $file): ?string
    {
        if (! $file->isFile() || ! $file->storage_path) {
            return null;
        }

        return Storage::disk($file->disk)->url($file->storage_path);
    }

    /**
     * @return array{binary: string, mime: string, extension: string}
     */
    protected function resizeContain(string $contents, int $maxEdge): array
    {
        $source = @imagecreatefromstring($contents);

        if ($source === false) {
            throw new RuntimeException('Unable to decode image for thumbnail.');
        }

        $sourceWidth = imagesx($source);
        $sourceHeight = imagesy($source);

        if ($sourceWidth < 1 || $sourceHeight < 1) {
            imagedestroy($source);
            throw new RuntimeException('Invalid image dimensions.');
        }

        $scale = min(1, $maxEdge / max($sourceWidth, $sourceHeight));
        $targetWidth = max(1, (int) round($sourceWidth * $scale));
        $targetHeight = max(1, (int) round($sourceHeight * $scale));

        $canvas = imagecreatetruecolor($targetWidth, $targetHeight);

        if ($canvas === false) {
            imagedestroy($source);
            throw new RuntimeException('Unable to create thumbnail canvas.');
        }

        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
        imagefill($canvas, 0, 0, $transparent);
        imagealphablending($canvas, true);

        imagecopyresampled(
            $canvas,
            $source,
            0,
            0,
            0,
            0,
            $targetWidth,
            $targetHeight,
            $sourceWidth,
            $sourceHeight,
        );

        imagedestroy($source);

        ob_start();

        if (function_exists('imagewebp')) {
            imagewebp($canvas, null, 82);
            $binary = (string) ob_get_clean();
            imagedestroy($canvas);

            return [
                'binary' => $binary,
                'mime' => 'image/webp',
                'extension' => 'webp',
            ];
        }

        imagejpeg($canvas, null, 82);
        $binary = (string) ob_get_clean();
        imagedestroy($canvas);

        return [
            'binary' => $binary,
            'mime' => 'image/jpeg',
            'extension' => 'jpg',
        ];
    }

    protected function cachePath(File $file, int $size, ?string $extension = null): string
    {
        $extension ??= function_exists('imagewebp') ? 'webp' : 'jpg';
        $directory = trim(dirname((string) $file->storage_path), '.');
        $hash = hash('sha256', implode('|', [
            (string) $file->storage_path,
            (string) ($file->hash ?? ''),
            (string) $size,
            $extension,
        ]));

        $prefix = $directory === '' ? 'transforms' : $directory.'/transforms';

        return $prefix.'/'.$hash.'.'.$extension;
    }
}
