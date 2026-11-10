<?php

$filePublicBase = rtrim((string) env('FILE_PUBLIC_URL_BASE', env('APP_URL', 'http://localhost')), '/');

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3", "gcs", "azure-storage-blob"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => rtrim(env('APP_URL', 'http://localhost'), '/').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        'assets' => [
            'driver' => 'local',
            'root' => storage_path('app/public/assets'),
            'url' => $filePublicBase.'/storage/assets',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        /*
        | Effective-private file manager bytes. Not linked via storage:link —
        | only reachable through authenticated admin download / API content.
        */
        'private_assets' => [
            'driver' => 'local',
            'root' => storage_path('app/private/assets'),
            'visibility' => 'private',
            'serve' => false,
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

        /*
        | Google Cloud Storage (FILES_DISK=gcs). Requires
        | spatie/laravel-google-cloud-storage → league/flysystem-google-cloud-storage.
        | Prefer a service-account JSON via GOOGLE_CLOUD_KEY_FILE, or ADC /
        | GOOGLE_APPLICATION_CREDENTIALS.
        */
        'gcs' => [
            'driver' => 'gcs',
            'project_id' => env('GOOGLE_CLOUD_PROJECT_ID'),
            'key_file_path' => env('GOOGLE_CLOUD_KEY_FILE'),
            'bucket' => env('GOOGLE_CLOUD_STORAGE_BUCKET'),
            'path_prefix' => env('GOOGLE_CLOUD_STORAGE_PATH_PREFIX', ''),
            'storage_api_uri' => env('GOOGLE_CLOUD_STORAGE_API_URI'),
            'api_endpoint' => env('GOOGLE_CLOUD_STORAGE_API_ENDPOINT'),
            'visibility' => env('GOOGLE_CLOUD_STORAGE_VISIBILITY', 'private'),
            'visibility_handler' => null,
            'metadata' => ['cacheControl' => 'public,max-age=86400'],
            'throw' => false,
            'report' => false,
        ],

        /*
        | Azure Blob Storage (FILES_DISK=azure). Requires
        | azure-oss/storage-blob-laravel → azure-oss/storage-blob-flysystem.
        | Connection string (shared key) is the simplest auth path; Entra ID /
        | managed identity options are documented by the package.
        */
        'azure' => [
            'driver' => 'azure-storage-blob',
            'connection_string' => env('AZURE_STORAGE_CONNECTION_STRING'),
            'container' => env('AZURE_STORAGE_CONTAINER', 'externa'),
            'prefix' => env('AZURE_STORAGE_PREFIX', ''),
            'url' => env('AZURE_STORAGE_URL'),
            'throw' => false,
            'report' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
