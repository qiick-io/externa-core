import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
// Tailwind v4 @import of leaflet.css in app.css is dropped from the Vite CSS
// pipeline — load styles with the map component so tiles/panes position correctly.
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    parseMapFieldSettings,
    type MapFieldSettings,
} from '@/lib/collection-field-types/parsers';

export type GeoJsonPoint = {
    type: 'Point';
    coordinates: [number, number];
};

export type GeoJsonMultiPoint = {
    type: 'MultiPoint';
    coordinates: [number, number][];
};

export type MapGeoJsonValue = GeoJsonPoint | GeoJsonMultiPoint;

type LatLng = { lat: number; lng: number };

/**
 * Parse stored map values (GeoJSON or legacy {lat,lng}) into positions.
 */
export function parseMapPositions(value: unknown): LatLng[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
    }

    const record = value as Record<string, unknown>;

    if ('lat' in record || 'lng' in record) {
        const lat = Number(record.lat);
        const lng = Number(record.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return [{ lat, lng }];
        }

        return [];
    }

    if (record.type === 'Point' && Array.isArray(record.coordinates)) {
        const lng = Number(record.coordinates[0]);
        const lat = Number(record.coordinates[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return [{ lat, lng }];
        }

        return [];
    }

    if (record.type === 'MultiPoint' && Array.isArray(record.coordinates)) {
        const out: LatLng[] = [];
        for (const pair of record.coordinates) {
            if (!Array.isArray(pair) || pair.length < 2) {
                continue;
            }
            const lng = Number(pair[0]);
            const lat = Number(pair[1]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                out.push({ lat, lng });
            }
        }

        return out;
    }

    return [];
}

type MapCoordinateInputProps = {
    idPrefix: string;
    nameBase: string;
    defaultValue?: unknown;
    readonly?: boolean;
    settings?: Record<string, unknown> | null;
};

/**
 * Leaflet OSM picker for map fields (Point or MultiPoint GeoJSON).
 */
export function MapCoordinateInput({
    idPrefix,
    nameBase,
    defaultValue,
    readonly = false,
    settings,
}: MapCoordinateInputProps) {
    const mapSettings: MapFieldSettings = useMemo(
        () => parseMapFieldSettings(settings),
        [settings],
    );
    const isMulti = mapSettings.geometryMode === 'multipoint';

    const initialPositions = useMemo(
        () => parseMapPositions(defaultValue),
        [defaultValue],
    );
    const [positions, setPositions] = useState<LatLng[]>(initialPositions);

    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const markersRef = useRef<LeafletMarker[]>([]);
    const leafletRef = useRef<typeof import('leaflet').default | null>(null);
    const [mapReady, setMapReady] = useState(false);
    const isMultiRef = useRef(isMulti);
    isMultiRef.current = isMulti;

    const centerLat =
        positions[0]?.lat ?? mapSettings.defaultLat ?? 45.4642;
    const centerLng =
        positions[0]?.lng ?? mapSettings.defaultLng ?? 9.19;

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const leafletModule = await import('leaflet');
            const L = leafletModule.default ?? leafletModule;

            if (cancelled || !mapContainerRef.current || mapRef.current) {
                return;
            }

            // Vite breaks Leaflet default icon URLs — use CDN icons.
            // ponytail: ceiling = offline/CDN; upgrade = local asset imports.
            L.Icon.Default.mergeOptions({
                iconRetinaUrl:
                    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
                iconUrl:
                    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                shadowUrl:
                    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            });

            leafletRef.current = L;

            const map = L.map(mapContainerRef.current, {
                zoomControl: true,
                attributionControl: true,
            }).setView([centerLat, centerLng], mapSettings.defaultZoom);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19,
            }).addTo(map);

            if (!readonly) {
                map.on('click', (event: { latlng: { lat: number; lng: number } }) => {
                    const next = { lat: event.latlng.lat, lng: event.latlng.lng };
                    setPositions((prev) =>
                        isMultiRef.current ? [...prev, next] : [next],
                    );
                });
            }

            mapRef.current = map;
            setMapReady(true);
            // Force size after layout (drawer/collapsible).
            requestAnimationFrame(() => map.invalidateSize());
        })();

        return () => {
            cancelled = true;
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];
            mapRef.current?.remove();
            mapRef.current = null;
            leafletRef.current = null;
            setMapReady(false);
        };
        // Init once; markers sync in the next effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only map bootstrap
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        const L = leafletRef.current;
        if (!mapReady || !map || !L) {
            return;
        }

        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];

        positions.forEach((position, index) => {
            const marker = L.marker([position.lat, position.lng], {
                draggable: !readonly,
            }).addTo(map);

            if (!readonly) {
                marker.on('dragend', () => {
                    const latLng = marker.getLatLng();
                    setPositions((prev) => {
                        const next = [...prev];
                        next[index] = { lat: latLng.lat, lng: latLng.lng };

                        return next;
                    });
                });
            }

            markersRef.current.push(marker);
        });

        if (positions.length === 1) {
            map.setView(
                [positions[0].lat, positions[0].lng],
                map.getZoom() || mapSettings.defaultZoom,
            );
        } else if (positions.length > 1) {
            const bounds = L.latLngBounds(
                positions.map((p) => [p.lat, p.lng] as [number, number]),
            );
            map.fitBounds(bounds.pad(0.2));
        }
    }, [mapReady, positions, readonly, mapSettings.defaultZoom]);

    const updatePosition = (index: number, key: 'lat' | 'lng', raw: string) => {
        const num = raw === '' ? Number.NaN : Number(raw);
        setPositions((prev) => {
            const next = [...prev];
            const current = next[index] ?? { lat: centerLat, lng: centerLng };
            next[index] = {
                ...current,
                [key]: Number.isFinite(num) ? num : current[key],
            };

            return next;
        });
    };

    const removePosition = (index: number) => {
        setPositions((prev) => prev.filter((_, i) => i !== index));
    };

    const addPosition = () => {
        setPositions((prev) => [
            ...prev,
            { lat: centerLat, lng: centerLng },
        ]);
    };

    const clearAll = () => setPositions([]);

    const geoType = isMulti ? 'MultiPoint' : 'Point';

    return (
        <div className="space-y-4">
            <div
                ref={mapContainerRef}
                className="h-56 w-full overflow-hidden rounded-lg border z-0"
            />

            {!readonly && (
                <p className="text-xs text-muted-foreground">
                    {isMulti
                        ? 'Click the map to add markers. Drag to move; remove from the list.'
                        : 'Click the map to set the point, or drag the marker.'}
                </p>
            )}

            {isMulti ? (
                <div className="space-y-3">
                    {positions.map((position, index) => (
                        <div
                            key={`${idPrefix}-pt-${index}`}
                            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                        >
                            <div className="grid gap-2">
                                <Label htmlFor={`${idPrefix}_lat_${index}`}>
                                    Latitude {index + 1}
                                </Label>
                                <Input
                                    id={`${idPrefix}_lat_${index}`}
                                    type="number"
                                    step="any"
                                    min={-90}
                                    max={90}
                                    value={Number.isFinite(position.lat) ? position.lat : ''}
                                    readOnly={readonly}
                                    onChange={(event) =>
                                        updatePosition(index, 'lat', event.target.value)
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor={`${idPrefix}_lng_${index}`}>
                                    Longitude {index + 1}
                                </Label>
                                <Input
                                    id={`${idPrefix}_lng_${index}`}
                                    type="number"
                                    step="any"
                                    min={-180}
                                    max={180}
                                    value={Number.isFinite(position.lng) ? position.lng : ''}
                                    readOnly={readonly}
                                    onChange={(event) =>
                                        updatePosition(index, 'lng', event.target.value)
                                    }
                                />
                            </div>
                            {!readonly && (
                                <div className="flex items-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => removePosition(index)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                    {!readonly && (
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={addPosition}>
                                Add point
                            </Button>
                            {positions.length > 0 && (
                                <Button type="button" variant="ghost" onClick={clearAll}>
                                    Clear
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                        <Label htmlFor={`${idPrefix}_lat`}>Latitude</Label>
                        <Input
                            id={`${idPrefix}_lat`}
                            type="number"
                            step="any"
                            min={-90}
                            max={90}
                            value={
                                positions[0] && Number.isFinite(positions[0].lat)
                                    ? positions[0].lat
                                    : ''
                            }
                            readOnly={readonly}
                            onChange={(event) => {
                                const raw = event.target.value;
                                if (raw === '') {
                                    setPositions([]);

                                    return;
                                }
                                const lat = Number(raw);
                                setPositions((prev) => [
                                    {
                                        lat: Number.isFinite(lat) ? lat : centerLat,
                                        lng: prev[0]?.lng ?? centerLng,
                                    },
                                ]);
                            }}
                            placeholder={String(mapSettings.defaultLat ?? 45.4642)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor={`${idPrefix}_lng`}>Longitude</Label>
                        <Input
                            id={`${idPrefix}_lng`}
                            type="number"
                            step="any"
                            min={-180}
                            max={180}
                            value={
                                positions[0] && Number.isFinite(positions[0].lng)
                                    ? positions[0].lng
                                    : ''
                            }
                            readOnly={readonly}
                            onChange={(event) => {
                                const raw = event.target.value;
                                if (raw === '') {
                                    setPositions([]);

                                    return;
                                }
                                const lng = Number(raw);
                                setPositions((prev) => [
                                    {
                                        lat: prev[0]?.lat ?? centerLat,
                                        lng: Number.isFinite(lng) ? lng : centerLng,
                                    },
                                ]);
                            }}
                            placeholder={String(mapSettings.defaultLng ?? 9.19)}
                        />
                    </div>
                </div>
            )}

            {/* Hidden GeoJSON form fields for traditional POST / Inertia forms.
                Always send type so clears reach the server (empty → null). */}
            <input type="hidden" name={`${nameBase}[type]`} value={geoType} />
            {isMulti
                ? positions.map((position, index) => (
                      <FragmentHiddenCoords
                          key={`${nameBase}-mp-${index}`}
                          nameBase={nameBase}
                          index={index}
                          lat={position.lat}
                          lng={position.lng}
                      />
                  ))
                : positions[0]
                  ? (
                        <>
                            <input
                                type="hidden"
                                name={`${nameBase}[coordinates][0]`}
                                value={positions[0].lng}
                            />
                            <input
                                type="hidden"
                                name={`${nameBase}[coordinates][1]`}
                                value={positions[0].lat}
                            />
                        </>
                    )
                  : null}
        </div>
    );
}

function FragmentHiddenCoords({
    nameBase,
    index,
    lat,
    lng,
}: {
    nameBase: string;
    index: number;
    lat: number;
    lng: number;
}) {
    return (
        <>
            <input
                type="hidden"
                name={`${nameBase}[coordinates][${index}][0]`}
                value={lng}
            />
            <input
                type="hidden"
                name={`${nameBase}[coordinates][${index}][1]`}
                value={lat}
            />
        </>
    );
}
