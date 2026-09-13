declare module 'react-file-icon' {
    import type { ComponentType, SVGProps } from 'react';

    export type FileIconStyle = Record<string, string | number | undefined>;

    export const defaultStyles: Record<string, FileIconStyle>;

    export const FileIcon: ComponentType<
        SVGProps<SVGSVGElement> & {
            extension?: string;
            color?: string;
            glyphColor?: string;
            labelColor?: string;
            labelTextColor?: string;
            foldColor?: string;
            radius?: number;
        } & FileIconStyle
    >;
}
