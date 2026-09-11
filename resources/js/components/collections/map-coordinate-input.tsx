import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import type * as LeafletNS from 'leaflet';
import {
    LocateFixed,
    MapPinPlus,
    Maximize2,
    Minus,
    Plus,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
// Tailwind v4 @import of leaflet.css in app.css is dropped from the Vite CSS
// pipeline — load styles with the map component so tiles/panes position correctly.
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { parseMapFieldSettings } from '@/lib/collection-field-types/parsers';
import type { MapFieldSettings } from '@/lib/collection-field-types/parsers';
import { normalizeLatLng, parseMapPositions } from '@/lib/map-geometry';
import type { MapLatLng } from '@/lib/map-geometry';
import { cn } from '@/lib/utils';

export type GeoJsonPoint = {
    type: 'Point';
    coordinates: [number, number];
};

export type GeoJsonMultiPoint = {
    type: 'MultiPoint';
    coordinates: [number, number][];
};

export type MapGeoJsonValue = GeoJsonPoint | GeoJsonMultiPoint;

export { normalizeLatLng, parseMapPositions };
export type { MapLatLng };

type LatLng = MapLatLng;

type MapTool = 'add' | 'delete';

/** Directus-like filled circle — no PNG icon URLs (Vite breaks Leaflet defaults). */
function pointDivIcon(L: typeof LeafletNS) {
    return L.divIcon({
        className: 'externa-map-point',
        html: `<span style="
            display:block;width:14px;height:14px;border-radius:9999px;
            background:#6644ff;border:2px solid #fff;
            box-shadow:0 1px 4px rgba(0,0,0,.35);
        "></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
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
 * Directus-like: left toolbar, click-to-add, no lat/lng inputs.
 * LineString/Polygon draw deferred — no leaflet-geoman/draw dep yet.
 */
export function MapCoordinateInput({
    idPrefix,
    nameBase,
    defaultValue,
    readonly = false,
    settings,
}: MapCoordinateInputProps) {
    const { t } = useTranslation();
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
    const [tool, setTool] = useState<MapTool>('add');
    const [locating, setLocating] = useState(false);

    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const markersRef = useRef<LeafletMarker[]>([]);
    const leafletRef = useRef<typeof LeafletNS | null>(null);
    const [mapReady, setMapReady] = useState(false);
    const isMultiRef = useRef(isMulti);
    const toolRef = useRef<MapTool>(tool);
    const readonlyRef = useRef(readonly);
    isMultiRef.current = isMulti;
    toolRef.current = tool;
    readonlyRef.current = readonly;

    const centerLat = positions[0]?.lat ?? mapSettings.defaultLat ?? 45.4642;
    const centerLng = positions[0]?.lng ?? mapSettings.defaultLng ?? 9.19;

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const leafletModule = await import('leaflet');
            const L = (leafletModule.default ??
                leafletModule) as typeof LeafletNS;

            if (cancelled || !mapContainerRef.current || mapRef.current) {
                return;
            }

            leafletRef.current = L;

            const map = L.map(mapContainerRef.current, {
                zoomControl: false,
                attributionControl: true,
            }).setView([centerLat, centerLng], mapSettings.defaultZoom);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19,
            }).addTo(map);

            map.on(
                'click',
                (event: { latlng: { lat: number; lng: number } }) => {
                    if (readonlyRef.current || toolRef.current !== 'add') {
                        return;
                    }

                    const next = normalizeLatLng(
                        event.latlng.lat,
                        event.latlng.lng,
                    );

                    if (!next) {
                        return;
                    }

                    setPositions((prev) =>
                        isMultiRef.current ? [...prev, next] : [next],
                    );
                },
            );

            mapRef.current = map;
            setMapReady(true);

            const invalidate = () => map.invalidateSize({ animate: false });
            requestAnimationFrame(() => {
                invalidate();
                requestAnimationFrame(invalidate);
            });
            // Layout shifts (tabs/collapsibles) leave Leaflet with a stale size → wild lat/lng.
            const ro = new ResizeObserver(() => invalidate());
            ro.observe(mapContainerRef.current);

            // Stash for cleanup.
            (map as unknown as { __externaRo?: ResizeObserver }).__externaRo =
                ro;
        })();

        return () => {
            cancelled = true;
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];
            const map = mapRef.current as
                (LeafletMap & { __externaRo?: ResizeObserver }) | null;
            map?.__externaRo?.disconnect();
            map?.remove();
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

        const icon = pointDivIcon(L);

        positions.forEach((position, index) => {
            const marker = L.marker([position.lat, position.lng], {
                icon,
                draggable: !readonly && tool !== 'delete',
                keyboard: false,
                title: '',
            }).addTo(map);

            if (!readonly) {
                marker.on('click', (event: { originalEvent?: Event }) => {
                    event.originalEvent?.stopPropagation?.();

                    if (toolRef.current === 'delete') {
                        setPositions((prev) =>
                            prev.filter((_, i) => i !== index),
                        );
                    }
                });

                marker.on('dragend', () => {
                    const latLng = marker.getLatLng();
                    const normalized = normalizeLatLng(latLng.lat, latLng.lng);

                    if (!normalized) {
                        return;
                    }

                    setPositions((prev) => {
                        const next = [...prev];
                        next[index] = normalized;

                        return next;
                    });
                });
            }

            markersRef.current.push(marker);
        });

        const cursor = readonly || tool !== 'add' ? '' : 'crosshair';
        map.getContainer().style.cursor = cursor;
    }, [mapReady, positions, readonly, tool]);

    // Fit once when markers first load / change count meaningfully — avoid fighting user pan.
    const fittedKeyRef = useRef<string>('');
    useEffect(() => {
        const map = mapRef.current;
        const L = leafletRef.current;

        if (!mapReady || !map || !L || positions.length === 0) {
            return;
        }

        const key = positions
            .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
            .join('|');

        if (key === fittedKeyRef.current) {
            return;
        }

        // Only auto-fit on initial hydrate (empty → has points), not every click-add.
        if (fittedKeyRef.current === '' && positions.length > 0) {
            if (positions.length === 1) {
                map.setView(
                    [positions[0].lat, positions[0].lng],
                    map.getZoom() || mapSettings.defaultZoom,
                );
            } else {
                const bounds = L.latLngBounds(
                    positions.map((p) => [p.lat, p.lng] as [number, number]),
                );
                map.fitBounds(bounds.pad(0.2));
            }
        }

        fittedKeyRef.current = key;
    }, [mapReady, positions, mapSettings.defaultZoom]);

    const zoomBy = (delta: number) => {
        mapRef.current?.setZoom((mapRef.current.getZoom() ?? 0) + delta);
    };

    const fitToPoints = () => {
        const map = mapRef.current;
        const L = leafletRef.current;

        if (!map || !L) {
            return;
        }

        if (positions.length === 0) {
            map.setView(
                [
                    mapSettings.defaultLat ?? 45.4642,
                    mapSettings.defaultLng ?? 9.19,
                ],
                mapSettings.defaultZoom,
            );

            return;
        }

        if (positions.length === 1) {
            map.setView(
                [positions[0].lat, positions[0].lng],
                Math.max(map.getZoom(), 14),
            );

            return;
        }

        const bounds = L.latLngBounds(
            positions.map((p) => [p.lat, p.lng] as [number, number]),
        );
        map.fitBounds(bounds.pad(0.2));
    };

    const geolocate = () => {
        if (!navigator.geolocation || locating) {
            return;
        }

        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocating(false);
                const next = normalizeLatLng(
                    pos.coords.latitude,
                    pos.coords.longitude,
                );

                if (!next) {
                    return;
                }

                mapRef.current?.setView([next.lat, next.lng], 16);

                if (readonly) {
                    return;
                }

                if (tool === 'add') {
                    setPositions((prev) =>
                        isMulti ? [...prev, next] : [next],
                    );
                }
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 10_000 },
        );
    };

    const clearAll = () => setPositions([]);

    const geoType = isMulti ? 'MultiPoint' : 'Point';

    return (
        <div className="space-y-2">
            <div className="relative z-0 w-full overflow-hidden rounded-lg border">
                <div
                    ref={mapContainerRef}
                    className="h-[min(70vh,500px)] min-h-[400px] w-full"
                    data-map-field={idPrefix}
                />

                {!readonly && (
                    <TooltipProvider delayDuration={200}>
                        <div
                            className="absolute top-3 left-3 z-[1000] flex flex-col gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur-sm"
                            role="toolbar"
                            aria-label={t('collections.map.toolbar')}
                        >
                            <ToolbarButton
                                label={t('collections.map.zoomIn')}
                                onClick={() => zoomBy(1)}
                            >
                                <Plus className="size-4" />
                            </ToolbarButton>
                            <ToolbarButton
                                label={t('collections.map.zoomOut')}
                                onClick={() => zoomBy(-1)}
                            >
                                <Minus className="size-4" />
                            </ToolbarButton>
                            <ToolbarSep />
                            <ToolbarButton
                                label={t('collections.map.locate')}
                                onClick={geolocate}
                                disabled={locating}
                            >
                                <LocateFixed className="size-4" />
                            </ToolbarButton>
                            <ToolbarButton
                                label={t('collections.map.fit')}
                                onClick={fitToPoints}
                            >
                                <Maximize2 className="size-4" />
                            </ToolbarButton>
                            <ToolbarSep />
                            <ToolbarButton
                                label={t('collections.map.addPoint')}
                                pressed={tool === 'add'}
                                onClick={() => setTool('add')}
                            >
                                <MapPinPlus className="size-4" />
                            </ToolbarButton>
                            {/* LineString / Polygon: hide until leaflet-geoman (or draw) is a dep. */}
                            <ToolbarButton
                                label={t('collections.map.delete')}
                                pressed={tool === 'delete'}
                                onClick={() => {
                                    if (
                                        tool === 'delete' &&
                                        positions.length > 0
                                    ) {
                                        clearAll();

                                        return;
                                    }

                                    setTool('delete');
                                }}
                                disabled={
                                    positions.length === 0 && tool !== 'delete'
                                }
                            >
                                <Trash2 className="size-4" />
                            </ToolbarButton>
                            {/* Second click on trash while active clears all points. */}
                        </div>
                    </TooltipProvider>
                )}
            </div>

            {!readonly && (
                <p className="text-xs text-muted-foreground">
                    {tool === 'delete'
                        ? t('collections.map.hintDelete')
                        : isMulti
                          ? t('collections.map.hintMulti')
                          : t('collections.map.hintPoint')}
                </p>
            )}

            {/* Hidden GeoJSON form fields for traditional POST / Inertia forms.
                Always send type so clears reach the server (empty → null). */}
            <input type="hidden" name={`${nameBase}[type]`} value={geoType} />
            {isMulti ? (
                positions.map((position, index) => (
                    <FragmentHiddenCoords
                        key={`${nameBase}-mp-${index}`}
                        nameBase={nameBase}
                        index={index}
                        lat={position.lat}
                        lng={position.lng}
                    />
                ))
            ) : positions[0] ? (
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
            ) : null}
        </div>
    );
}

function ToolbarSep() {
    return <div className="mx-1 my-0.5 h-px bg-border" aria-hidden />;
}

function ToolbarButton({
    label,
    onClick,
    children,
    pressed,
    disabled,
}: {
    label: string;
    onClick: () => void;
    children: ReactNode;
    pressed?: boolean;
    disabled?: boolean;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant={pressed ? 'default' : 'ghost'}
                    className={cn('size-8 shrink-0', pressed && 'shadow-xs')}
                    aria-label={label}
                    aria-pressed={pressed}
                    disabled={disabled}
                    onClick={onClick}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
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
