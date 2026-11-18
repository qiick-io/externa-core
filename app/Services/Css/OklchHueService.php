<?php

declare(strict_types=1);

namespace App\Services\Css;

/**
 * OKLCH hue helpers for brand / AI accent collision checks.
 */
final class OklchHueService
{
    /**
     * Absolute circular distance between two hues in degrees (0–180).
     */
    public static function distanceDegrees(float $hueA, float $hueB): float
    {
        $delta = fmod(abs($hueA - $hueB), 360.0);

        return min($delta, 360.0 - $delta);
    }

    /**
     * OKLCH hue (degrees) for a `#RRGGBB` colour, or null if unparseable / achromatic.
     */
    public static function fromHex(?string $hex): ?float
    {
        $rgb = self::parseHex($hex);

        if ($rgb === null) {
            return null;
        }

        [$okLabL, $okLabA, $okLabB] = self::linearSrgbToOklab(
            self::toLinear($rgb[0]),
            self::toLinear($rgb[1]),
            self::toLinear($rgb[2]),
        );

        $chroma = sqrt(($okLabA * $okLabA) + ($okLabB * $okLabB));

        if ($chroma < 0.001) {
            return null;
        }

        $hue = rad2deg(atan2($okLabB, $okLabA));

        if ($hue < 0.0) {
            $hue += 360.0;
        }

        return $hue;
    }

    /**
     * Whether `$hex` sits within `$toleranceDegrees` of `$targetHue` in OKLCH.
     */
    public static function isWithinHue(?string $hex, float $targetHue, float $toleranceDegrees): bool
    {
        $hue = self::fromHex($hex);

        if ($hue === null) {
            return false;
        }

        return self::distanceDegrees($hue, $targetHue) <= $toleranceDegrees;
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

    private static function toLinear(float $channel): float
    {
        return $channel <= 0.04045
            ? $channel / 12.92
            : (($channel + 0.055) / 1.055) ** 2.4;
    }

    /**
     * @return array{0: float, 1: float, 2: float} OKLab L, a, b.
     */
    private static function linearSrgbToOklab(float $r, float $g, float $b): array
    {
        $l = (0.4122214708 * $r) + (0.5363325363 * $g) + (0.0514459929 * $b);
        $m = (0.2119034982 * $r) + (0.6806995451 * $g) + (0.1073969566 * $b);
        $s = (0.0883024619 * $r) + (0.2817188376 * $g) + (0.6299787005 * $b);

        $lRoot = $l ** (1 / 3);
        $mRoot = $m ** (1 / 3);
        $sRoot = $s ** (1 / 3);

        return [
            (0.2104542553 * $lRoot) + (0.7936177850 * $mRoot) - (0.0040720468 * $sRoot),
            (1.9779984951 * $lRoot) - (2.4285922050 * $mRoot) + (0.4505937099 * $sRoot),
            (0.0259040371 * $lRoot) + (0.7827717662 * $mRoot) - (0.8086757660 * $sRoot),
        ];
    }
}
