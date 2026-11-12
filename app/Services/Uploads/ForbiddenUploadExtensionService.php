<?php

declare(strict_types=1);

namespace App\Services\Uploads;

use Illuminate\Validation\ValidationException;

/**
 * Hard-floor denylist for upload / rename extensions (last segment wins).
 *
 * SVG/SVGZ are gated by {@see UploadAllowlistService::allowSvg()} — never by the
 * project extension allowlist alone. Executables / HTML / SSI stay blocked always.
 */
final class ForbiddenUploadExtensionService
{
    /**
     * Always blocked — cannot be enabled via project settings.
     *
     * @var list<string>
     */
    private const HARD_FLOOR = [
        'php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php6', 'php7', 'php8', 'pht',
        'exe', 'bat', 'cmd', 'com', 'msi', 'scr',
        'js', 'mjs', 'vbs', 'wsf', 'hta', 'cgi', 'pl',
        'asp', 'aspx', 'jsp',
        'sh', 'bash', 'ps1',
        'dll', 'so',
        // Stored XSS / content-sniff when served from a public disk
        'html', 'htm', 'shtml', 'shtm',
        // Markup / SSI often served with risky browser sniffing
        'xml', 'xhtml', 'xht', 'mht', 'xsl',
    ];

    public static function isHardFloor(string $fileName): bool
    {
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

        return $extension !== '' && in_array($extension, self::HARD_FLOOR, true);
    }

    public static function isSvgExtension(string $fileName): bool
    {
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

        return $extension !== '' && in_array($extension, UploadAllowlistService::SVG_EXTENSIONS, true);
    }

    public static function isForbidden(string $fileName): bool
    {
        if (self::isHardFloor($fileName)) {
            return true;
        }

        if (self::isSvgExtension($fileName)) {
            return ! app(UploadAllowlistService::class)->allowSvg();
        }

        return false;
    }

    /**
     * @throws ValidationException
     */
    public static function assertAllowed(string $fileName, string $field = 'file'): void
    {
        if (self::isHardFloor($fileName)) {
            throw ValidationException::withMessages([
                $field => [__('This file type is blocked by the security floor and cannot be enabled.')],
            ]);
        }

        if (self::isSvgExtension($fileName) && ! app(UploadAllowlistService::class)->allowSvg()) {
            throw ValidationException::withMessages([
                $field => [__('SVG uploads are disabled. Enable SVG in Files project settings to allow them (XSS risk).')],
            ]);
        }
    }
}
