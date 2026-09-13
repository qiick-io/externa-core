<?php

namespace App\Support\Css;

/**
 * Picks black or white text for a solid background hex (WCAG relative luminance).
 */
final class ContrastingForeground
{
    public const WHITE = '#ffffff';

    public const BLACK = '#000000';

    /**
     * Return `#ffffff` or `#000000` for best contrast against `$hex`, or null if unparseable.
     */
    public static function forHex(?string $hex): ?string
    {
        $rgb = self::parseHex($hex);

        if ($rgb === null) {
            return null;
        }

        $luminance = self::relativeLuminance($rgb[0], $rgb[1], $rgb[2]);

        // WCAG contrast ratio (L + 0.05) / (0 + 0.05) vs white; pick the better one.
        $contrastWhite = (1.0 + 0.05) / ($luminance + 0.05);
        $contrastBlack = ($luminance + 0.05) / (0.0 + 0.05);

        return $contrastWhite >= $contrastBlack ? self::WHITE : self::BLACK;
    }

    /**
     * @return array{0: float, 1: float, 2: float}|null Channel values in 0–1.
     */
    private static function parseHex(?string $hex): ?array
    {
        if ($hex === null) {
            return null;
        }

        $value = ltrim(trim($hex), '#');

        if (strlen($value) === 3 && ctype_xdigit($value)) {
            $value = $value[0].$value[0].$value[1].$value[1].$value[2].$value[2];
        }

        if (strlen($value) !== 6 || ! ctype_xdigit($value)) {
            return null;
        }

        return [
            hexdec(substr($value, 0, 2)) / 255,
            hexdec(substr($value, 2, 2)) / 255,
            hexdec(substr($value, 4, 2)) / 255,
        ];
    }

    private static function relativeLuminance(float $r, float $g, float $b): float
    {
        return 0.2126 * self::toLinear($r)
            + 0.7152 * self::toLinear($g)
            + 0.0722 * self::toLinear($b);
    }

    private static function toLinear(float $channel): float
    {
        return $channel <= 0.04045
            ? $channel / 12.92
            : (($channel + 0.055) / 1.055) ** 2.4;
    }
}
