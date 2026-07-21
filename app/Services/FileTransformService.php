<?php

namespace App\Services;

use App\Models\File;
use App\Services\Settings\ProjectSettings;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Generates and caches image transforms via PHP GD (no Sharp / Intervention).
 */
class FileTransformService
{
    public const DEFAULT_SIZE = 128;

    public const MAX_SIZE = 256;

    public const DEFAULT_QUALITY = 82;

    /**
     * @var list<int>
     */
    private const LEGACY_CLEANUP_SIZES = [64, 128, 256];

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
        $max = $this->maxSize();
        $resolved = $size ?? min(self::DEFAULT_SIZE, $max);

        if ($resolved < 1) {
            $resolved = min(self::DEFAULT_SIZE, $max);
        }

        return min($resolved, $max);
    }

    /**
     * Ensure a contain-fit thumbnail exists and return its storage path.
     *
     * Backward-compatible square transform used by ?size=N.
     */
    public function ensureThumbnail(File $file, ?int $size = null): string
    {
        $size = $this->clampSize($size);

        // inside (not contain): matches prior square thumbs — scale to fit, no letterbox
        return $this->ensureTransform($file, [
            'key' => 'size-'.$size,
            'fit' => 'inside',
            'width' => $size,
            'height' => $size,
            'quality' => self::DEFAULT_QUALITY,
            'without_enlargement' => true,
            'format' => 'auto',
        ]);
    }

    /**
     * Apply a named project preset and return the cached storage path.
     *
     * @param  array{
     *     key?: string,
     *     fit?: string,
     *     width?: int|null,
     *     height?: int|null,
     *     quality?: int,
     *     without_enlargement?: bool,
     *     format?: string
     * }|null  $preset
     */
    public function ensureTransform(File $file, ?array $preset = null, ?string $key = null): string
    {
        if (! $this->transformationsEnabled()) {
            throw new RuntimeException('Image transformations are disabled.');
        }

        if (! $this->isImage($file) || ! $file->storage_path) {
            throw new RuntimeException('Thumbnails are only available for image files.');
        }

        if ($preset === null) {
            if ($key === null) {
                return $this->ensureThumbnail($file);
            }

            $preset = app(ProjectSettings::class)->transformPreset($key);
            if ($preset === null) {
                throw new RuntimeException("Unknown transform preset [{$key}].");
            }
        }

        $preset = $this->normalizePresetInput($preset);
        $preset['focal_x'] = $this->clampFocal($file->focal_point_x);
        $preset['focal_y'] = $this->clampFocal($file->focal_point_y);
        $disk = Storage::disk($file->disk);
        $extension = $this->resolveExtension($preset['format']);

        $existingPath = $this->cachePath($file, $preset, $extension);
        if ($disk->exists($existingPath)) {
            return $existingPath;
        }

        // auto may have been written as jpg when webp was unavailable
        if ($preset['format'] === 'auto') {
            foreach (['webp', 'jpg', 'png'] as $candidate) {
                $candidatePath = $this->cachePath($file, $preset, $candidate);
                if ($disk->exists($candidatePath)) {
                    return $candidatePath;
                }
            }
        }

        if (! $disk->exists($file->storage_path)) {
            throw new RuntimeException('Source file is missing from storage.');
        }

        $contents = $disk->get($file->storage_path);

        if ($contents === false || $contents === '') {
            throw new RuntimeException('Unable to read source image.');
        }

        $encoded = $this->transform($contents, $preset);
        $cachePath = $this->cachePath($file, $preset, $encoded['extension']);
        $disk->put($cachePath, $encoded['binary']);

        return $cachePath;
    }

    /**
     * Remove cached transform files for the given file across known presets.
     */
    public function clearTransforms(File $file): void
    {
        if (! $file->storage_path) {
            return;
        }

        $disk = Storage::disk($file->disk);
        $presets = $this->cleanupPresets();

        foreach ($presets as $preset) {
            foreach (['webp', 'jpg', 'png'] as $extension) {
                $path = $this->cachePath($file, $preset, $extension);

                if ($disk->exists($path)) {
                    $disk->delete($path);
                }
            }
        }

        // Legacy hash was size + extension only (pre-structured presets)
        foreach (self::LEGACY_CLEANUP_SIZES as $size) {
            foreach (['webp', 'jpg'] as $extension) {
                $path = $this->legacyCachePath($file, $size, $extension);

                if ($disk->exists($path)) {
                    $disk->delete($path);
                }
            }
        }
    }

    /**
     * Pre-structured-preset cache path (size edge only).
     */
    private function legacyCachePath(File $file, int $size, string $extension): string
    {
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

    public function maxSize(): int
    {
        try {
            return app(ProjectSettings::class)->maxTransformSize();
        } catch (\Throwable) {
            return self::MAX_SIZE;
        }
    }

    public function transformationsEnabled(): bool
    {
        try {
            return app(ProjectSettings::class)->transformationsEnabled();
        } catch (\Throwable) {
            return true;
        }
    }

    /**
     * MIME type for a cached transform path extension.
     */
    public function mimeForPath(string $path): string
    {
        return match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
            'webp' => 'image/webp',
            'png' => 'image/png',
            default => 'image/jpeg',
        };
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
     * @return list<array{
     *     key: string,
     *     fit: string,
     *     width: int|null,
     *     height: int|null,
     *     quality: int,
     *     without_enlargement: bool,
     *     format: string
     * }>
     */
    private function cleanupPresets(): array
    {
        $presets = [];

        try {
            $presets = app(ProjectSettings::class)->presetTransformations();
        } catch (\Throwable) {
            $presets = [];
        }

        foreach (self::LEGACY_CLEANUP_SIZES as $size) {
            // Match ensureThumbnail() hash inputs (inside, not contain)
            $presets[] = [
                'key' => 'size-'.$size,
                'fit' => 'inside',
                'width' => $size,
                'height' => $size,
                'quality' => self::DEFAULT_QUALITY,
                'without_enlargement' => true,
                'format' => 'auto',
            ];
        }

        return $presets;
    }

    /**
     * @param  array<string, mixed>  $preset
     * @return array{
     *     key: string,
     *     fit: string,
     *     width: int|null,
     *     height: int|null,
     *     quality: int,
     *     without_enlargement: bool,
     *     format: string
     * }
     */
    private function normalizePresetInput(array $preset): array
    {
        $fits = config('settings.project.transform_fits', ['contain', 'cover', 'inside', 'outside']);
        $formats = config('settings.project.transform_formats', ['auto', 'jpeg', 'png', 'webp']);

        $fit = is_string($preset['fit'] ?? null) ? $preset['fit'] : 'contain';
        if (! in_array($fit, $fits, true)) {
            $fit = 'contain';
        }

        $format = is_string($preset['format'] ?? null) ? $preset['format'] : 'auto';
        if (! in_array($format, $formats, true)) {
            $format = 'auto';
        }

        $width = isset($preset['width']) && $preset['width'] !== null ? (int) $preset['width'] : null;
        $height = isset($preset['height']) && $preset['height'] !== null ? (int) $preset['height'] : null;
        if ($width !== null && $width < 1) {
            $width = null;
        }
        if ($height !== null && $height < 1) {
            $height = null;
        }
        if ($width === null && $height === null) {
            $width = self::DEFAULT_SIZE;
            $height = self::DEFAULT_SIZE;
        }

        $quality = is_numeric($preset['quality'] ?? null)
            ? (int) $preset['quality']
            : self::DEFAULT_QUALITY;

        return [
            'key' => is_string($preset['key'] ?? null) ? $preset['key'] : 'custom',
            'fit' => $fit,
            'width' => $width,
            'height' => $height,
            'quality' => max(1, min(100, $quality)),
            'without_enlargement' => (bool) ($preset['without_enlargement'] ?? true),
            'format' => $format,
        ];
    }

    /**
     * @param  array{
     *     key: string,
     *     fit: string,
     *     width: int|null,
     *     height: int|null,
     *     quality: int,
     *     without_enlargement: bool,
     *     format: string
     * }  $preset
     * @return array{binary: string, mime: string, extension: string}
     */
    protected function transform(string $contents, array $preset): array
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

        $geometry = $this->resolveGeometry(
            $sourceWidth,
            $sourceHeight,
            $preset['width'],
            $preset['height'],
            $preset['fit'],
            $preset['without_enlargement'],
            $preset['focal_x'] ?? null,
            $preset['focal_y'] ?? null,
        );

        $canvas = imagecreatetruecolor($geometry['canvas_w'], $geometry['canvas_h']);

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
            $geometry['dst_x'],
            $geometry['dst_y'],
            $geometry['src_x'],
            $geometry['src_y'],
            $geometry['dst_w'],
            $geometry['dst_h'],
            $geometry['src_w'],
            $geometry['src_h'],
        );

        imagedestroy($source);

        return $this->encodeCanvas($canvas, $preset['format'], $preset['quality']);
    }

    /**
     * @return array{
     *     canvas_w: int,
     *     canvas_h: int,
     *     dst_x: int,
     *     dst_y: int,
     *     dst_w: int,
     *     dst_h: int,
     *     src_x: int,
     *     src_y: int,
     *     src_w: int,
     *     src_h: int
     * }
     */
    private function resolveGeometry(
        int $sourceWidth,
        int $sourceHeight,
        ?int $width,
        ?int $height,
        string $fit,
        bool $withoutEnlargement,
        ?float $focalX = null,
        ?float $focalY = null,
    ): array {
        $targetW = $width ?? $height ?? $sourceWidth;
        $targetH = $height ?? $width ?? $sourceHeight;

        return match ($fit) {
            'cover' => $this->geometryCover($sourceWidth, $sourceHeight, $targetW, $targetH, $withoutEnlargement, $focalX, $focalY),
            'outside' => $this->geometryOutside($sourceWidth, $sourceHeight, $targetW, $targetH, $withoutEnlargement),
            'contain' => $this->geometryContain($sourceWidth, $sourceHeight, $targetW, $targetH, $withoutEnlargement, pad: true),
            default => $this->geometryContain($sourceWidth, $sourceHeight, $targetW, $targetH, $withoutEnlargement, pad: false),
        };
    }

    /**
     * @return array{
     *     canvas_w: int,
     *     canvas_h: int,
     *     dst_x: int,
     *     dst_y: int,
     *     dst_w: int,
     *     dst_h: int,
     *     src_x: int,
     *     src_y: int,
     *     src_w: int,
     *     src_h: int
     * }
     */
    private function geometryContain(
        int $sw,
        int $sh,
        int $tw,
        int $th,
        bool $withoutEnlargement,
        bool $pad,
    ): array {
        $scale = min($tw / $sw, $th / $sh);
        if ($withoutEnlargement) {
            $scale = min(1, $scale);
        }

        $dw = max(1, (int) round($sw * $scale));
        $dh = max(1, (int) round($sh * $scale));

        if ($pad) {
            return [
                'canvas_w' => $tw,
                'canvas_h' => $th,
                'dst_x' => (int) floor(($tw - $dw) / 2),
                'dst_y' => (int) floor(($th - $dh) / 2),
                'dst_w' => $dw,
                'dst_h' => $dh,
                'src_x' => 0,
                'src_y' => 0,
                'src_w' => $sw,
                'src_h' => $sh,
            ];
        }

        return [
            'canvas_w' => $dw,
            'canvas_h' => $dh,
            'dst_x' => 0,
            'dst_y' => 0,
            'dst_w' => $dw,
            'dst_h' => $dh,
            'src_x' => 0,
            'src_y' => 0,
            'src_w' => $sw,
            'src_h' => $sh,
        ];
    }

    /**
     * @return array{
     *     canvas_w: int,
     *     canvas_h: int,
     *     dst_x: int,
     *     dst_y: int,
     *     dst_w: int,
     *     dst_h: int,
     *     src_x: int,
     *     src_y: int,
     *     src_w: int,
     *     src_h: int
     * }
     */
    private function geometryCover(
        int $sw,
        int $sh,
        int $tw,
        int $th,
        bool $withoutEnlargement,
        ?float $focalX = null,
        ?float $focalY = null,
    ): array {
        $fx = $focalX ?? 0.5;
        $fy = $focalY ?? 0.5;

        $scale = max($tw / $sw, $th / $sh);

        // Sharp-like: do not upscale — emit source (focal crop only if larger)
        if ($withoutEnlargement && $scale > 1) {
            $cropW = min($sw, $tw);
            $cropH = min($sh, $th);

            return [
                'canvas_w' => $cropW,
                'canvas_h' => $cropH,
                'dst_x' => 0,
                'dst_y' => 0,
                'dst_w' => $cropW,
                'dst_h' => $cropH,
                'src_x' => $this->focalOffset($sw, $cropW, $fx),
                'src_y' => $this->focalOffset($sh, $cropH, $fy),
                'src_w' => $cropW,
                'src_h' => $cropH,
            ];
        }

        $srcW = max(1, min($sw, (int) round($tw / $scale)));
        $srcH = max(1, min($sh, (int) round($th / $scale)));

        return [
            'canvas_w' => $tw,
            'canvas_h' => $th,
            'dst_x' => 0,
            'dst_y' => 0,
            'dst_w' => $tw,
            'dst_h' => $th,
            'src_x' => $this->focalOffset($sw, $srcW, $fx),
            'src_y' => $this->focalOffset($sh, $srcH, $fy),
            'src_w' => $srcW,
            'src_h' => $srcH,
        ];
    }

    /**
     * Place a crop window so focal (0–1) stays near the center; clamp to edges.
     */
    private function focalOffset(int $source, int $crop, float $focal): int
    {
        $ideal = (int) round(($source * $focal) - ($crop / 2));

        return max(0, min($source - $crop, $ideal));
    }

    private function clampFocal(mixed $value): ?float
    {
        if ($value === null || ! is_numeric($value)) {
            return null;
        }

        return max(0.0, min(1.0, (float) $value));
    }

    /**
     * @return array{
     *     canvas_w: int,
     *     canvas_h: int,
     *     dst_x: int,
     *     dst_y: int,
     *     dst_w: int,
     *     dst_h: int,
     *     src_x: int,
     *     src_y: int,
     *     src_w: int,
     *     src_h: int
     * }
     */
    private function geometryOutside(
        int $sw,
        int $sh,
        int $tw,
        int $th,
        bool $withoutEnlargement,
    ): array {
        $scale = max($tw / $sw, $th / $sh);
        if ($withoutEnlargement) {
            $scale = min(1, $scale);
        }

        $dw = max(1, (int) round($sw * $scale));
        $dh = max(1, (int) round($sh * $scale));

        return [
            'canvas_w' => $dw,
            'canvas_h' => $dh,
            'dst_x' => 0,
            'dst_y' => 0,
            'dst_w' => $dw,
            'dst_h' => $dh,
            'src_x' => 0,
            'src_y' => 0,
            'src_w' => $sw,
            'src_h' => $sh,
        ];
    }

    /**
     * @return array{binary: string, mime: string, extension: string}
     */
    protected function encodeCanvas(\GdImage $canvas, string $format, int $quality): array
    {
        $resolved = $this->resolveEncodeFormat($format);

        ob_start();

        match ($resolved) {
            'png' => imagepng($canvas, null, (int) round((100 - $quality) / 11.111)), // 0–9
            'webp' => imagewebp($canvas, null, $quality),
            default => imagejpeg($canvas, null, $quality),
        };

        $binary = (string) ob_get_clean();
        imagedestroy($canvas);

        return match ($resolved) {
            'png' => ['binary' => $binary, 'mime' => 'image/png', 'extension' => 'png'],
            'webp' => ['binary' => $binary, 'mime' => 'image/webp', 'extension' => 'webp'],
            default => ['binary' => $binary, 'mime' => 'image/jpeg', 'extension' => 'jpg'],
        };
    }

    private function resolveEncodeFormat(string $format): string
    {
        if ($format === 'png') {
            return 'png';
        }

        if ($format === 'webp' || $format === 'auto') {
            if (function_exists('imagewebp')) {
                return 'webp';
            }

            return 'jpeg';
        }

        return 'jpeg';
    }

    private function resolveExtension(string $format): string
    {
        return match ($this->resolveEncodeFormat($format)) {
            'png' => 'png',
            'webp' => 'webp',
            default => 'jpg',
        };
    }

    /**
     * @param  array{
     *     key: string,
     *     fit: string,
     *     width: int|null,
     *     height: int|null,
     *     quality: int,
     *     without_enlargement: bool,
     *     format: string
     * }  $preset
     */
    protected function cachePath(File $file, array $preset, string $extension): string
    {
        $directory = trim(dirname((string) $file->storage_path), '.');
        $hash = hash('sha256', implode('|', [
            (string) $file->storage_path,
            (string) ($file->hash ?? ''),
            $preset['key'],
            $preset['fit'],
            (string) ($preset['width'] ?? ''),
            (string) ($preset['height'] ?? ''),
            (string) $preset['quality'],
            $preset['without_enlargement'] ? '1' : '0',
            $preset['format'],
            (string) ($preset['focal_x'] ?? ''),
            (string) ($preset['focal_y'] ?? ''),
            $extension,
        ]));

        $prefix = $directory === '' ? 'transforms' : $directory.'/transforms';

        return $prefix.'/'.$hash.'.'.$extension;
    }
}
