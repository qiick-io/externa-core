import { Crosshair } from 'lucide-react';
import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Focal point on the 0–1 scale the backend clamps to (`FileTransformService::clampFocal`). */
export type FocalPoint = { x: number; y: number };

const CENTRE: FocalPoint = { x: 0.5, y: 0.5 };
const PREVIEW_RATIO = 16 / 9;
const NUDGE_STEP = 0.01;
const NUDGE_STEP_LARGE = 0.1;

function clampUnit(value: number): number {
    return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}

function asPercent(value: number): number {
    return Math.round(value * 100);
}

/**
 * Directus-style focal point picker for the file detail panel: click the
 * image to set the point, a crosshair marks it. The image sits in a 16:9
 * `AspectRatio` frame inside a box with its own aspect ratio, so click
 * coordinates map to the image and never to the letterbox.
 *
 * Keyboard: the image is one button. Arrow keys nudge the point by 1%
 * (Shift: 10%) starting from the centre when no point is set; Enter / Space
 * set the point at the current position (the centre when none is set).
 *
 * @returns {JSX.Element}
 */
export function FocalPointPicker({
    src,
    alt,
    imageWidth,
    imageHeight,
    value,
    disabled = false,
    onChange,
}: {
    src: string;
    alt: string;
    /** Intrinsic size from the file row; the loaded image fills in when missing. */
    imageWidth: number | null;
    imageHeight: number | null;
    value: FocalPoint | null;
    disabled?: boolean;
    onChange: (next: FocalPoint) => void;
}) {
    const { t } = useTranslation();
    const [loadedRatio, setLoadedRatio] = useState<number | null>(null);
    const imageRatio =
        imageWidth && imageHeight
            ? imageWidth / imageHeight
            : (loadedRatio ?? PREVIEW_RATIO);
    const current = value ?? CENTRE;

    const setFromPointer = (event: MouseEvent<HTMLButtonElement>): void => {
        // Keyboard activation (Enter / Space) fires click with detail 0.
        if (event.detail === 0) {
            onChange(current);

            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();

        onChange({
            x: clampUnit((event.clientX - rect.left) / rect.width),
            y: clampUnit((event.clientY - rect.top) / rect.height),
        });
    };

    const nudge = (event: KeyboardEvent<HTMLButtonElement>): void => {
        const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
        const delta: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
        };
        const move = delta[event.key];

        if (!move) {
            return;
        }

        event.preventDefault();
        onChange({
            x: clampUnit(current.x + move[0]),
            y: clampUnit(current.y + move[1]),
        });
    };

    const readout = value
        ? t('files.detail.focalReadout', {
              x: asPercent(value.x),
              y: asPercent(value.y),
          })
        : t('files.detail.focalNotSet');

    return (
        <div className="flex w-full flex-col gap-2">
            <AspectRatio
                ratio={PREVIEW_RATIO}
                className="flex items-center justify-center rounded bg-muted"
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            data-test="focal-point-picker"
                            disabled={disabled}
                            aria-label={t('files.detail.focalPickerLabel', {
                                readout,
                            })}
                            className={cn(
                                'relative max-h-full max-w-full overflow-hidden rounded outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                imageRatio >= PREVIEW_RATIO
                                    ? 'w-full'
                                    : 'h-full',
                                disabled
                                    ? 'cursor-default'
                                    : 'cursor-crosshair',
                            )}
                            style={{ aspectRatio: imageRatio }}
                            onClick={setFromPointer}
                            onKeyDown={nudge}
                        >
                            <img
                                src={src}
                                alt={alt}
                                draggable={false}
                                className="pointer-events-none size-full object-fill select-none"
                                onLoad={(event) => {
                                    const image = event.currentTarget;

                                    if (
                                        image.naturalWidth &&
                                        image.naturalHeight
                                    ) {
                                        setLoadedRatio(
                                            image.naturalWidth /
                                                image.naturalHeight,
                                        );
                                    }
                                }}
                            />
                            {value ? (
                                <span
                                    data-test="focal-point-marker"
                                    aria-hidden="true"
                                    className="pointer-events-none absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/40 text-white shadow-md"
                                    style={{
                                        left: `${value.x * 100}%`,
                                        top: `${value.y * 100}%`,
                                    }}
                                >
                                    <Crosshair className="size-4" />
                                </span>
                            ) : null}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {t('files.detail.focalHint')}
                    </TooltipContent>
                </Tooltip>
            </AspectRatio>
            <div className="flex items-center justify-between gap-2">
                <p
                    className="text-xs text-muted-foreground tabular-nums"
                    aria-live="polite"
                    data-test="focal-point-readout"
                >
                    {readout}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onChange(CENTRE)}
                >
                    {t('files.detail.focalReset')}
                </Button>
            </div>
        </div>
    );
}
