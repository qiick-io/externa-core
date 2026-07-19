import { Paperclip } from 'lucide-react';
import {
    useCallback,
    useState
    
    
} from 'react';
import type {DragEvent, ReactNode} from 'react';
import { cn } from '@/lib/utils';

function isFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

type AiChatDropZoneProps = {
    children: ReactNode;
    onFilesSelected: (files: File[]) => void;
    disabled?: boolean;
    className?: string;
};

/**
 * Drop target for attaching files to an AI message.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function AiChatDropZone({
    children,
    onFilesSelected,
    disabled = false,
    className,
}: AiChatDropZoneProps) {
    const [isDragOver, setIsDragOver] = useState(false);

    const clearDragOver = useCallback((): void => {
        setIsDragOver(false);
    }, []);

    const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
        if (disabled || !isFileDrag(event)) {
            return;
        }

        event.preventDefault();
        setIsDragOver(true);
    };

    const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
        if (disabled || !isFileDrag(event)) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
    };

    const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
        if (disabled) {
            return;
        }

        const relatedTarget = event.relatedTarget;

        if (
            relatedTarget instanceof Node &&
            event.currentTarget.contains(relatedTarget)
        ) {
            return;
        }

        clearDragOver();
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
        if (disabled || !isFileDrag(event)) {
            return;
        }

        event.preventDefault();
        clearDragOver();

        const droppedFiles = Array.from(event.dataTransfer.files ?? []);

        if (droppedFiles.length === 0) {
            return;
        }

        onFilesSelected(droppedFiles);
    };

    return (
        <div
            className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', className)}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {children}
            {isDragOver && !disabled ? (
                <div
                    className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10"
                    aria-hidden
                >
                    <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-lg">
                        <Paperclip className="size-4" />
                        Rilascia per allegare
                    </div>
                </div>
            ) : null}
        </div>
    );
}
