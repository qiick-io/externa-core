<?php

return [

    /*
    |--------------------------------------------------------------------------
    | File manager disk
    |--------------------------------------------------------------------------
    |
    | Disk used for CMS/user file uploads (file manager, public files API).
    | Use `assets` (local under storage/app/public/assets) or `s3` (S3/MinIO/R2).
    | Prepared zip archives stay on the local ephemeral volume (see zip_*).
    |
    */

    'disk' => env('FILES_DISK', 'assets'),

    /*
    |--------------------------------------------------------------------------
    | Sync duplicate size threshold
    |--------------------------------------------------------------------------
    |
    | Single non-folder files at or below this size are duplicated inline.
    | Folders, bulk selections, and larger files are queued.
    |
    */

    'duplicate_sync_max_bytes' => (int) env('FILES_DUPLICATE_SYNC_MAX_BYTES', 52_428_800),

    /*
    |--------------------------------------------------------------------------
    | Prepared zip downloads
    |--------------------------------------------------------------------------
    |
    | Multi-file / folder zips are built asynchronously under storage/app/zips.
    | Files older than the TTL are removed by `files:cleanup-zips`.
    |
    */

    'zip_ttl_minutes' => (int) env('FILES_ZIP_TTL_MINUTES', 60),

    'zip_max_bytes' => (int) env('FILES_ZIP_MAX_BYTES', 104_857_600),

    /*
    |--------------------------------------------------------------------------
    | Upload MIME allowlist + magic-byte checks
    |--------------------------------------------------------------------------
    |
    | After the extension denylist (ForbiddenUploadExtension), uploads must
    | sniff to one of these MIME types. Magic-byte prefixes below are enforced
    | when the filename extension claims that format (rejects .exe→.pdf, etc.).
    | Only the first 16 bytes are read for magic checks.
    |
    */

    'upload_allowed_mimes' => [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/heic',
        'image/heif',
        'image/avif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
        'application/x-zip-compressed',
        'application/gzip',
        'application/x-tar',
        'text/plain',
        'text/csv',
        'text/markdown',
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'audio/mpeg',
        'audio/mp4',
        'audio/wav',
        'audio/ogg',
        'audio/webm',
        // Non-sniffable binaries with a non-forbidden extension still land here.
        'application/octet-stream',
    ],

    /*
    |--------------------------------------------------------------------------
    | Magic-byte signatures (hex), keyed by lowercase extension
    |--------------------------------------------------------------------------
    */

    'upload_magic_signatures' => [
        'pdf' => ['255044462D'],
        'jpg' => ['FFD8FF'],
        'jpeg' => ['FFD8FF'],
        'png' => ['89504E470D0A1A0A'],
        'gif' => ['474946383761', '474946383961'], // GIF87a / GIF89a
    ],

];
