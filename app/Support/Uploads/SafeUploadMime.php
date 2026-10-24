<?php

namespace App\Support\Uploads;

use Illuminate\Validation\ValidationException;

/**
 * Server-side MIME sniffing + allowlists for user-uploaded bytes.
 */
final class SafeUploadMime
{
    /**
     * Raster types that may be served inline (never SVG/HTML/XML).
     *
     * @var list<string>
     */
    public const INLINE_IMAGE_MIMES = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
    ];

    /**
     * Active / scriptable types that must never be stored or served as declared.
     *
     * @var list<string>
     */
    public const DANGEROUS_MIMES = [
        'text/html',
        'image/svg+xml',
        'application/xhtml+xml',
        'text/xml',
        'application/xml',
        'application/javascript',
        'text/javascript',
    ];

    /**
     * Chat attachment extension → accepted MIME types (finfo must agree).
     *
     * @var array<string, list<string>>
     */
    public const CHAT_EXTENSION_MIMES = [
        'jpg' => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
        'png' => ['image/png'],
        'gif' => ['image/gif'],
        'webp' => ['image/webp'],
        'pdf' => ['application/pdf'],
        'doc' => ['application/msword'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        'xls' => ['application/vnd.ms-excel'],
        'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        'txt' => ['text/plain'],
        'csv' => ['text/csv', 'text/plain'],
    ];

    /**
     * Sniff MIME from raw bytes (finfo). Empty / unknown → application/octet-stream.
     */
    public static function sniff(string $contents): string
    {
        if ($contents === '') {
            return 'application/octet-stream';
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->buffer($contents);

        if (! is_string($mime) || $mime === '' || $mime === 'application/x-empty') {
            return 'application/octet-stream';
        }

        return strtolower($mime);
    }

    public static function isDangerous(string $mime): bool
    {
        $mime = strtolower($mime);

        if (in_array($mime, self::DANGEROUS_MIMES, true)) {
            return true;
        }

        // finfo sometimes returns "text/html; charset=utf-8"
        foreach (self::DANGEROUS_MIMES as $dangerous) {
            if (str_starts_with($mime, $dangerous)) {
                return true;
            }
        }

        return false;
    }

    public static function isInlineImage(string $mime): bool
    {
        $mime = strtolower(trim(explode(';', $mime, 2)[0]));

        return in_array($mime, self::INLINE_IMAGE_MIMES, true);
    }

    public static function extensionOf(string $fileName): string
    {
        return strtolower((string) pathinfo($fileName, PATHINFO_EXTENSION));
    }

    /**
     * Chat uploads: extension must be allowlisted and finfo must agree.
     *
     * @throws ValidationException
     */
    public static function assertChatAllowed(string $fileName, string $sniffedMime, string $field = 'file', ?string $bytes = null): string
    {
        ForbiddenUploadExtension::assertAllowed($fileName, $field);

        if ($bytes !== null) {
            MimeTypeValidator::assertAllowed($fileName, $bytes, $field);
        }

        $extension = self::extensionOf($fileName);
        $allowed = self::CHAT_EXTENSION_MIMES[$extension] ?? null;

        if ($allowed === null) {
            throw ValidationException::withMessages([
                $field => ['This file type is not allowed.'],
            ]);
        }

        $sniffed = strtolower(trim(explode(';', $sniffedMime, 2)[0]));

        if (self::isDangerous($sniffed) || ! in_array($sniffed, $allowed, true)) {
            throw ValidationException::withMessages([
                $field => ['File content does not match the declared file type.'],
            ]);
        }

        return $sniffed;
    }

    /**
     * Public Files pool: keep denylist, reject dangerous finfo, require extension/MIME agreement when known.
     *
     * @throws ValidationException
     */
    public static function assertFilePoolAllowed(string $fileName, string $sniffedMime, string $field = 'file', ?string $bytes = null): string
    {
        ForbiddenUploadExtension::assertAllowed($fileName, $field);

        if ($bytes !== null) {
            MimeTypeValidator::assertAllowed($fileName, $bytes, $field);
        }

        $sniffed = strtolower(trim(explode(';', $sniffedMime, 2)[0]));

        if (self::isDangerous($sniffed)) {
            throw ValidationException::withMessages([
                $field => ['This file type is not allowed.'],
            ]);
        }

        $extension = self::extensionOf($fileName);

        // When extension claims a known safe type, reject concrete mismatched types
        // (HTML-as-.txt, SVG-as-.png). application/octet-stream is allowed for
        // non-sniffable binaries that still use an allowlisted extension.
        if ($extension !== '' && isset(self::CHAT_EXTENSION_MIMES[$extension])) {
            $allowed = self::CHAT_EXTENSION_MIMES[$extension];
            if (in_array($sniffed, $allowed, true)) {
                return $sniffed;
            }
            if ($sniffed !== 'application/octet-stream') {
                throw ValidationException::withMessages([
                    $field => ['File content does not match the declared file type.'],
                ]);
            }

            return 'application/octet-stream';
        }

        return $sniffed !== '' ? $sniffed : 'application/octet-stream';
    }

    /**
     * Map a stored MIME through the serve allowlist (legacy rows included).
     *
     * @return array{mime: string, inline: bool}
     */
    public static function forServe(?string $storedMime, string $fileName = ''): array
    {
        $mime = is_string($storedMime) ? strtolower(trim(explode(';', $storedMime, 2)[0])) : '';

        if ($mime === '' || self::isDangerous($mime)) {
            return [
                'mime' => 'application/octet-stream',
                'inline' => false,
            ];
        }

        if (self::isInlineImage($mime)) {
            $extension = self::extensionOf($fileName);
            $allowed = self::CHAT_EXTENSION_MIMES[$extension] ?? null;

            // Inline only when extension (if present) agrees with a safe raster type.
            if ($extension === '' || $allowed === null || in_array($mime, $allowed, true)) {
                return [
                    'mime' => $mime,
                    'inline' => true,
                ];
            }
        }

        return [
            'mime' => $mime,
            'inline' => false,
        ];
    }
}
