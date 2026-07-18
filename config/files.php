<?php

return [

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

];
