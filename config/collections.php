<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Supported locales (seed / fallback)
    |--------------------------------------------------------------------------
    |
    | Used when project settings have not yet configured content_locales.
    | Runtime source of truth: ProjectSettingsService → content_locales.
    |
    */

    'locales' => [
        'en',
        'it',
    ],

    /*
    |--------------------------------------------------------------------------
    | Fallback locale chain (seed / fallback)
    |--------------------------------------------------------------------------
    |
    | Used when project settings have not yet configured fallback_content_locales.
    | Runtime source of truth: ProjectSettingsService → fallback_content_locales.
    |
    */

    'fallback_locales' => [
        'en',
        'it',
    ],

];
