<?php

namespace App\Support\Uploads;

use App\Services\Settings\ProjectSettings;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Project upload allowlist layered on the hard ForbiddenUploadExtension floor.
 *
 * Empty/null project overrides keep config/files.php defaults (1.3.0 behaviour).
 * SVG is never allowed unless {@see ProjectSettings::uploadAllowSvg()} is true.
 */
final class UploadAllowlist
{
    /**
     * @var list<string>
     */
    public const SVG_EXTENSIONS = ['svg', 'svgz'];

    public const SVG_MIME = 'image/svg+xml';

    public function __construct(
        private readonly ProjectSettings $projectSettings,
    ) {}

    public function allowSvg(): bool
    {
        try {
            return $this->projectSettings->uploadAllowSvg();
        } catch (Throwable) {
            // Unit tests without settings table: secure default.
            return (bool) config('files.upload_allow_svg', false);
        }
    }

    /**
     * Effective MIME allowlist (config default ∪ project override ∪ SVG when opted in).
     *
     * @return list<string>
     */
    public function allowedMimes(): array
    {
        $configured = null;
        try {
            $configured = $this->projectSettings->uploadAllowedMimes();
        } catch (Throwable) {
            $configured = null;
        }

        $mimes = $configured ?? array_values(array_filter(array_map(
            static fn (mixed $mime): string => strtolower(trim((string) $mime)),
            (array) config('files.upload_allowed_mimes', []),
        )));

        if ($this->allowSvg() && ! in_array(self::SVG_MIME, $mimes, true)) {
            $mimes[] = self::SVG_MIME;
        }

        return array_values(array_unique($mimes));
    }

    /**
     * Optional extension allowlist. null = no extra extension filter.
     *
     * @return list<string>|null
     */
    public function allowedExtensions(): ?array
    {
        try {
            $extensions = $this->projectSettings->uploadAllowedExtensions();
        } catch (Throwable) {
            $extensions = null;
        }

        if ($extensions === null || $extensions === []) {
            return null;
        }

        if ($this->allowSvg()) {
            foreach (self::SVG_EXTENSIONS as $svgExt) {
                if (! in_array($svgExt, $extensions, true)) {
                    $extensions[] = $svgExt;
                }
            }
        }

        return array_values(array_unique($extensions));
    }

    /**
     * Assert extension is permitted by the optional project allowlist.
     *
     * @throws ValidationException
     */
    public function assertExtensionAllowed(string $fileName, string $field = 'file'): void
    {
        $allowed = $this->allowedExtensions();
        if ($allowed === null) {
            return;
        }

        $extension = SafeUploadMime::extensionOf($fileName);
        if ($extension === '' || ! in_array($extension, $allowed, true)) {
            throw ValidationException::withMessages([
                $field => ['This file extension is not in the project upload allowlist.'],
            ]);
        }
    }

    public function isSvgMime(string $mime): bool
    {
        $mime = strtolower(trim(explode(';', $mime, 2)[0]));

        return $mime === self::SVG_MIME || str_starts_with($mime, self::SVG_MIME);
    }
}
