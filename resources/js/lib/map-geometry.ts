export type MapLatLng = { lat: number; lng: number };

/**
 * Keep GeoJSON positions inside WGS84 bounds (Leaflet can emit lng outside ±180).
 */
export function normalizeLatLng(lat: number, lng: number): MapLatLng | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    if (lat < -90 || lat > 90) {
        return null;
    }

    if (lng >= -180 && lng <= 180) {
        return { lat, lng };
    }

    // Wrap longitude into [-180, 180].
    let wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;

    // Keep 180 as 180 (avoid -180 flip for exact antimeridian).
    if (wrapped === -180 && lng > 0) {
        wrapped = 180;
    }

    return { lat, lng: wrapped };
}

/**
 * Parse stored map values (GeoJSON or legacy {lat,lng}) into positions.
 */
export function parseMapPositions(value: unknown): MapLatLng[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
    }

    const record = value as Record<string, unknown>;

    if ('lat' in record || 'lng' in record) {
        const normalized = normalizeLatLng(
            Number(record.lat),
            Number(record.lng),
        );

        return normalized ? [normalized] : [];
    }

    if (record.type === 'Point' && Array.isArray(record.coordinates)) {
        const normalized = normalizeLatLng(
            Number(record.coordinates[1]),
            Number(record.coordinates[0]),
        );

        return normalized ? [normalized] : [];
    }

    if (record.type === 'MultiPoint' && Array.isArray(record.coordinates)) {
        const out: MapLatLng[] = [];

        for (const pair of record.coordinates) {
            if (!Array.isArray(pair) || pair.length < 2) {
                continue;
            }

            const normalized = normalizeLatLng(
                Number(pair[1]),
                Number(pair[0]),
            );

            if (normalized) {
                out.push(normalized);
            }
        }

        return out;
    }

    return [];
}
