<?php

namespace App\Support\Collections;

/**
 * GeoJSON Point / MultiPoint helpers for map fields (legacy {lat,lng} compatible).
 */
final class MapGeometry
{
    public const MODE_POINT = 'point';

    public const MODE_MULTIPOINT = 'multipoint';

    /**
     * Normalize inbound map payloads to GeoJSON Point or MultiPoint.
     *
     * Accepts legacy `{ lat, lng }`, GeoJSON Point, and GeoJSON MultiPoint.
     * When `$geometryMode` is set, coerces the result to that mode.
     *
     * @return array{type: string, coordinates: mixed}|null
     */
    public static function normalize(mixed $value, ?string $geometryMode = null): ?array
    {
        $geo = self::parse($value);
        if ($geo === null) {
            return null;
        }

        $mode = self::normalizeMode($geometryMode);

        if ($mode === self::MODE_POINT) {
            $first = self::firstPosition($geo);
            if ($first === null) {
                return null;
            }

            return [
                'type' => 'Point',
                'coordinates' => $first,
            ];
        }

        $positions = self::positions($geo);
        if ($positions === []) {
            return null;
        }

        return [
            'type' => 'MultiPoint',
            'coordinates' => $positions,
        ];
    }

    /**
     * Ensure stored/legacy map values are exposed as GeoJSON on read.
     *
     * @return array{type: string, coordinates: mixed}|null
     */
    public static function toGeoJson(mixed $value): ?array
    {
        return self::parse($value);
    }

    public static function normalizeMode(mixed $mode): string
    {
        return $mode === self::MODE_MULTIPOINT
            ? self::MODE_MULTIPOINT
            : self::MODE_POINT;
    }

    /**
     * @return array{type: string, coordinates: mixed}|null
     */
    private static function parse(mixed $value): ?array
    {
        if (! is_array($value)) {
            return null;
        }

        if (self::looksLikeLegacy($value)) {
            $position = self::positionFromLatLng($value['lat'] ?? null, $value['lng'] ?? null);
            if ($position === null) {
                return null;
            }

            return [
                'type' => 'Point',
                'coordinates' => $position,
            ];
        }

        $type = $value['type'] ?? null;
        $coordinates = $value['coordinates'] ?? null;

        if ($type === 'Point') {
            $position = self::positionFromPair($coordinates);
            if ($position === null) {
                return null;
            }

            return [
                'type' => 'Point',
                'coordinates' => $position,
            ];
        }

        if ($type === 'MultiPoint') {
            if (! is_array($coordinates)) {
                return null;
            }

            $positions = [];
            foreach ($coordinates as $pair) {
                $position = self::positionFromPair($pair);
                if ($position === null) {
                    return null;
                }
                $positions[] = $position;
            }

            if ($positions === []) {
                return null;
            }

            return [
                'type' => 'MultiPoint',
                'coordinates' => $positions,
            ];
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $value
     */
    private static function looksLikeLegacy(array $value): bool
    {
        return array_key_exists('lat', $value) || array_key_exists('lng', $value);
    }

    /**
     * @return array{0: float, 1: float}|null
     */
    private static function positionFromLatLng(mixed $lat, mixed $lng): ?array
    {
        if ($lat === null || $lat === '' || $lng === null || $lng === '') {
            return null;
        }

        if (! is_numeric($lat) || ! is_numeric($lng)) {
            return null;
        }

        $latF = (float) $lat;
        $lngF = (float) $lng;

        if ($latF < -90.0 || $latF > 90.0 || $lngF < -180.0 || $lngF > 180.0) {
            return null;
        }

        return [$lngF, $latF];
    }

    /**
     * @return array{0: float, 1: float}|null
     */
    private static function positionFromPair(mixed $pair): ?array
    {
        if (! is_array($pair) || count($pair) < 2) {
            return null;
        }

        $lng = $pair[0] ?? null;
        $lat = $pair[1] ?? null;

        return self::positionFromLatLng($lat, $lng);
    }

    /**
     * @param  array{type: string, coordinates: mixed}  $geo
     * @return array{0: float, 1: float}|null
     */
    private static function firstPosition(array $geo): ?array
    {
        $positions = self::positions($geo);

        return $positions[0] ?? null;
    }

    /**
     * @param  array{type: string, coordinates: mixed}  $geo
     * @return list<array{0: float, 1: float}>
     */
    private static function positions(array $geo): array
    {
        if ($geo['type'] === 'Point') {
            $position = self::positionFromPair($geo['coordinates']);

            return $position === null ? [] : [$position];
        }

        if ($geo['type'] === 'MultiPoint' && is_array($geo['coordinates'])) {
            $out = [];
            foreach ($geo['coordinates'] as $pair) {
                $position = self::positionFromPair($pair);
                if ($position !== null) {
                    $out[] = $position;
                }
            }

            return $out;
        }

        return [];
    }
}
