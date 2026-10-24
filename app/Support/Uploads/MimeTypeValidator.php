<?php

namespace App\Support\Uploads;

use Illuminate\Validation\ValidationException;

/**
 * MIME allowlist + magic-byte checks for upload bytes (after extension denylist).
 */
final class MimeTypeValidator
{
    private const MAGIC_HEADER_BYTES = 16;

    /**
     * Assert sniffed MIME is allowlisted and (when applicable) magic bytes match.
     *
     * @param  string  $bytes  File contents or a prefix; only the first 16 bytes are used for magic.
     * @return string Normalized sniffed MIME
     *
     * @throws ValidationException
     */
    public static function assertAllowed(string $fileName, string $bytes, string $field = 'file'): string
    {
        $header = substr($bytes, 0, self::MAGIC_HEADER_BYTES);
        self::assertMagicMatchesExtension($fileName, $header, $field);

        $sniffed = SafeUploadMime::sniff($bytes !== '' ? $bytes : $header);
        $sniffed = strtolower(trim(explode(';', $sniffed, 2)[0]));

        /** @var list<string> $allowed */
        $allowed = array_values(array_filter(array_map(
            static fn (mixed $mime): string => strtolower(trim((string) $mime)),
            (array) config('files.upload_allowed_mimes', []),
        )));

        if ($allowed !== [] && ! in_array($sniffed, $allowed, true)) {
            throw ValidationException::withMessages([
                $field => ['This file type is not allowed.'],
            ]);
        }

        return $sniffed !== '' ? $sniffed : 'application/octet-stream';
    }

    /**
     * Assert magic bytes for a path without loading the whole file into memory.
     *
     * @throws ValidationException
     */
    public static function assertAllowedPath(string $fileName, string $absolutePath, string $field = 'file'): string
    {
        $handle = @fopen($absolutePath, 'rb');
        if ($handle === false) {
            throw ValidationException::withMessages([
                $field => ['Unable to read uploaded file.'],
            ]);
        }

        try {
            $header = fread($handle, self::MAGIC_HEADER_BYTES);
            if (! is_string($header)) {
                $header = '';
            }
        } finally {
            fclose($handle);
        }

        self::assertMagicMatchesExtension($fileName, $header, $field);

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $sniffed = $finfo->file($absolutePath);
        $sniffed = is_string($sniffed) && $sniffed !== '' && $sniffed !== 'application/x-empty'
            ? strtolower(trim(explode(';', $sniffed, 2)[0]))
            : 'application/octet-stream';

        /** @var list<string> $allowed */
        $allowed = array_values(array_filter(array_map(
            static fn (mixed $mime): string => strtolower(trim((string) $mime)),
            (array) config('files.upload_allowed_mimes', []),
        )));

        if ($allowed !== [] && ! in_array($sniffed, $allowed, true)) {
            throw ValidationException::withMessages([
                $field => ['This file type is not allowed.'],
            ]);
        }

        return $sniffed;
    }

    /**
     * @throws ValidationException
     */
    private static function assertMagicMatchesExtension(string $fileName, string $header, string $field): void
    {
        $extension = SafeUploadMime::extensionOf($fileName);
        if ($extension === '') {
            return;
        }

        /** @var array<string, list<string>> $signatures */
        $signatures = (array) config('files.upload_magic_signatures', []);
        $expected = $signatures[$extension] ?? null;
        if ($expected === null || $expected === []) {
            return;
        }

        $hex = strtoupper(bin2hex($header));
        foreach ($expected as $signature) {
            $needle = strtoupper(str_replace(' ', '', (string) $signature));
            if ($needle !== '' && str_starts_with($hex, $needle)) {
                return;
            }
        }

        throw ValidationException::withMessages([
            $field => ['File content does not match the declared file type.'],
        ]);
    }
}
