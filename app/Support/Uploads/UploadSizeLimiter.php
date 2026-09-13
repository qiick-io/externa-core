<?php

namespace App\Support\Uploads;

use Illuminate\Validation\ValidationException;

/**
 * Enforce project upload caps and surface infra (PHP) limits clearly.
 */
final class UploadSizeLimiter
{
    /**
     * Absolute ceiling for project setting values (50 GiB).
     */
    public const SETTING_MAX_BYTES = 50 * 1024 * 1024 * 1024;

    /**
     * Reject when size exceeds an optional project cap (null = unlimited).
     *
     * @throws ValidationException
     */
    public static function assertWithinCap(?int $maxBytes, int $size, string $field = 'file'): void
    {
        if ($maxBytes === null) {
            return;
        }

        if ($size > $maxBytes) {
            throw ValidationException::withMessages([
                $field => [sprintf(
                    'The file exceeds the %s upload limit.',
                    self::formatBytes($maxBytes),
                )],
            ]);
        }
    }

    /**
     * Reject single-request uploads larger than PHP upload_max_filesize / post_max_size.
     *
     * @throws ValidationException
     */
    public static function assertFitsPhpSingleUpload(int $size, string $field = 'file'): void
    {
        $phpMax = self::phpSingleUploadMaxBytes();

        if ($size > $phpMax) {
            throw ValidationException::withMessages([
                $field => [sprintf(
                    'File is larger than the PHP upload limit (%s). Use chunked upload or raise upload_max_filesize / post_max_size.',
                    self::formatBytes($phpMax),
                )],
            ]);
        }
    }

    /**
     * Effective single-request PHP upload ceiling.
     */
    public static function phpSingleUploadMaxBytes(): int
    {
        return min(
            self::iniBytes('upload_max_filesize'),
            self::iniBytes('post_max_size'),
        );
    }

    public static function formatBytes(int $bytes): string
    {
        if ($bytes < 1024) {
            return $bytes.' B';
        }

        $units = ['KB', 'MB', 'GB', 'TB'];
        $size = (float) $bytes;
        $unit = 'B';

        foreach ($units as $candidate) {
            if ($size < 1024) {
                break;
            }

            $size /= 1024;
            $unit = $candidate;
        }

        $precision = $size >= 10 || $unit === 'KB' ? 0 : 1;

        return rtrim(rtrim(number_format($size, $precision, '.', ''), '0'), '.').' '.$unit;
    }

    private static function iniBytes(string $key): int
    {
        $raw = trim((string) ini_get($key));

        if ($raw === '' || $raw === '0') {
            return PHP_INT_MAX;
        }

        $unit = strtolower(substr($raw, -1));
        $value = $raw;

        if (in_array($unit, ['g', 'm', 'k'], true)) {
            $value = substr($raw, 0, -1);
        }

        if (! is_numeric($value)) {
            return PHP_INT_MAX;
        }

        $bytes = (int) $value;

        return match ($unit) {
            'g' => $bytes * 1024 * 1024 * 1024,
            'm' => $bytes * 1024 * 1024,
            'k' => $bytes * 1024,
            default => $bytes,
        };
    }
}
