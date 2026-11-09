/**
 * Whether a picked file is shown as media (image or video) rather than as a
 * file attachment in chat.
 */
export function isMediaFile(file: File): boolean {
    return file.type.startsWith('image/') || file.type.startsWith('video/');
}
