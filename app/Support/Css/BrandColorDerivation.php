<?php

namespace App\Support\Css;

/**
 * Derive AA-checked foreground / hover / ring colours from a brand hex.
 *
 * @phpstan-type BrandDerivationResult array{
 *     primary: string,
 *     primaryForeground: string|null,
 *     hover: string|null,
 *     ring: string|null,
 *     passesAa: bool
 * }
 */
final class BrandColorDerivation
{
    public const FOREGROUND_LIGHT = '#FFFFFF';

    public const FOREGROUND_DARK = '#0E171E';

    private const TEXT_CONTRAST_MIN = 4.5;

    private const UI_CONTRAST_MIN = 3.0;

    /**
     * @return BrandDerivationResult
     */
    public static function fromHex(?string $hex, string $surfaceBackground = '#FFFFFF'): array
    {
        if ($hex === null || self::parseHex($hex) === null) {
            return [
                'primary' => $hex ?? '',
                'primaryForeground' => null,
                'hover' => null,
                'ring' => null,
                'passesAa' => false,
            ];
        }

        $normalized = self::normalizeHex($hex);
        $foreground = self::pickForeground($normalized);
        $hover = self::deriveHover($normalized, $surfaceBackground);
        $ring = self::deriveRing($normalized, $surfaceBackground);

        $passesAa = self::contrastRatio($normalized, $foreground) >= self::TEXT_CONTRAST_MIN
            && self::contrastRatio($ring, $surfaceBackground) >= self::UI_CONTRAST_MIN;

        return [
            'primary' => $normalized,
            'primaryForeground' => $foreground,
            'hover' => $hover,
            'ring' => $ring,
            'passesAa' => $passesAa,
        ];
    }

    /**
     * Pick white or ink-950 for best text contrast on the brand colour.
     */
    public static function pickForeground(string $hex): string
    {
        $contrastWhite = self::contrastRatio($hex, self::FOREGROUND_LIGHT);
        $contrastInk = self::contrastRatio($hex, self::FOREGROUND_DARK);

        $whitePasses = $contrastWhite >= self::TEXT_CONTRAST_MIN;
        $inkPasses = $contrastInk >= self::TEXT_CONTRAST_MIN;

        if ($whitePasses && $inkPasses) {
            return $contrastWhite >= $contrastInk
                ? self::FOREGROUND_LIGHT
                : self::FOREGROUND_DARK;
        }

        if ($whitePasses) {
            return self::FOREGROUND_LIGHT;
        }

        if ($inkPasses) {
            return self::FOREGROUND_DARK;
        }

        return $contrastWhite >= $contrastInk
            ? self::FOREGROUND_LIGHT
            : self::FOREGROUND_DARK;
    }

    /**
     * Whether a colour meets the WCAG 1.4.11 non-text minimum (3:1) on a surface,
     * e.g. a focus ring or focused border on the page background.
     */
    public static function meetsUiContrast(string $hex, string $surfaceBackground): bool
    {
        return self::contrastRatio($hex, $surfaceBackground) >= self::UI_CONTRAST_MIN;
    }

    public static function contrastRatio(string $backgroundHex, string $foregroundHex): float
    {
        $l1 = self::relativeLuminance($backgroundHex);
        $l2 = self::relativeLuminance($foregroundHex);

        if ($l1 === null || $l2 === null) {
            return 0.0;
        }

        $lighter = max($l1, $l2);
        $darker = min($l1, $l2);

        return ($lighter + 0.05) / ($darker + 0.05);
    }

    private static function deriveHover(string $hex, string $surfaceBackground): string
    {
        $surfaceLuminance = self::relativeLuminance($surfaceBackground) ?? 1.0;
        // Darken on light surfaces; lighten on dark surfaces.
        $factor = $surfaceLuminance > 0.5 ? 0.85 : 1.18;
        $hover = self::scaleHex($hex, $factor);

        return $hover ?? $hex;
    }

    private static function deriveRing(string $hex, string $surfaceBackground): string
    {
        if (self::contrastRatio($hex, $surfaceBackground) >= self::UI_CONTRAST_MIN) {
            return $hex;
        }

        $surfaceLuminance = self::relativeLuminance($surfaceBackground) ?? 1.0;
        $candidate = self::scaleHex($hex, $surfaceLuminance > 0.5 ? 0.72 : 1.35);

        if ($candidate !== null
            && self::contrastRatio($candidate, $surfaceBackground) >= self::UI_CONTRAST_MIN) {
            return $candidate;
        }

        return $hex;
    }

    private static function scaleHex(string $hex, float $factor): ?string
    {
        $rgb = self::parseHex($hex);

        if ($rgb === null) {
            return null;
        }

        $scaled = array_map(
            static fn (float $channel): int => (int) max(0, min(255, round($channel * 255 * $factor))),
            $rgb,
        );

        return sprintf('#%02X%02X%02X', $scaled[0], $scaled[1], $scaled[2]);
    }

    private static function normalizeHex(string $hex): string
    {
        $value = ltrim(trim($hex), '#');

        if (strlen($value) === 3) {
            $value = $value[0].$value[0].$value[1].$value[1].$value[2].$value[2];
        }

        return '#'.strtoupper($value);
    }

    /**
     * @return array{0: float, 1: float, 2: float}|null
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

    private static function relativeLuminance(string $hex): ?float
    {
        $rgb = self::parseHex($hex);

        if ($rgb === null) {
            return null;
        }

        return 0.2126 * self::toLinear($rgb[0])
            + 0.7152 * self::toLinear($rgb[1])
            + 0.0722 * self::toLinear($rgb[2]);
    }

    private static function toLinear(float $channel): float
    {
        return $channel <= 0.04045
            ? $channel / 12.92
            : (($channel + 0.055) / 1.055) ** 2.4;
    }
}
