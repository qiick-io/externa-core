import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type MapCoordinateValue = {
    lat: number | null;
    lng: number | null;
};

function parseMapCoordinateValue(value: unknown): MapCoordinateValue {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { lat: null, lng: null };
    }

    const record = value as { lat?: unknown; lng?: unknown };
    const lat =
        record.lat === null || record.lat === undefined || record.lat === ''
            ? null
            : Number(record.lat);
    const lng =
        record.lng === null || record.lng === undefined || record.lng === ''
            ? null
            : Number(record.lng);

    return {
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
    };
}

type MapCoordinateInputProps = {
    idPrefix: string;
    nameBase: string;
    defaultValue?: unknown;
    readonly?: boolean;
};

/**
 * Latitude and longitude input pair for map field types.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function MapCoordinateInput({
    idPrefix,
    nameBase,
    defaultValue,
    readonly = false,
}: MapCoordinateInputProps) {
    const initial = useMemo(
        () => parseMapCoordinateValue(defaultValue),
        [defaultValue],
    );
    const [latitude, setLatitude] = useState(
        initial.lat === null ? '' : String(initial.lat),
    );
    const [longitude, setLongitude] = useState(
        initial.lng === null ? '' : String(initial.lng),
    );

    const parsedLatitude = latitude === '' ? null : Number(latitude);
    const parsedLongitude = longitude === '' ? null : Number(longitude);
    const hasValidCoordinates =
        parsedLatitude !== null &&
        parsedLongitude !== null &&
        Number.isFinite(parsedLatitude) &&
        Number.isFinite(parsedLongitude);

    const mapLinks = hasValidCoordinates
        ? {
              openStreetMapUrl: `https://www.openstreetmap.org/?mlat=${parsedLatitude}&mlon=${parsedLongitude}#map=14/${parsedLatitude}/${parsedLongitude}`,
              embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${parsedLongitude - 0.05}%2C${parsedLatitude - 0.03}%2C${parsedLongitude + 0.05}%2C${parsedLatitude + 0.03}&layer=mapnik&marker=${parsedLatitude}%2C${parsedLongitude}`,
          }
        : null;

    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                    <Label htmlFor={`${idPrefix}_lat`}>Latitude</Label>
                    <Input
                        id={`${idPrefix}_lat`}
                        type="number"
                        step="any"
                        min={-90}
                        max={90}
                        name={`${nameBase}[lat]`}
                        value={latitude}
                        readOnly={readonly}
                        onChange={(event) => setLatitude(event.target.value)}
                        placeholder="45.4642"
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
                        name={`${nameBase}[lng]`}
                        value={longitude}
                        readOnly={readonly}
                        onChange={(event) => setLongitude(event.target.value)}
                        placeholder="9.1900"
                    />
                </div>
            </div>

            {mapLinks !== null && (
                <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border">
                        <iframe
                            title="OpenStreetMap preview"
                            className="h-48 w-full border-0"
                            loading="lazy"
                            src={mapLinks.embedUrl}
                        />
                    </div>
                    <a
                        href={mapLinks.openStreetMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                        Open in OpenStreetMap
                    </a>
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                Coordinates are stored as latitude and longitude. An interactive
                Leaflet picker can be added later.
            </p>
        </div>
    );
}
