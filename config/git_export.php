<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Optional git export (content-as-code)
    |--------------------------------------------------------------------------
    |
    | When enabled, publishing an item queues a commit+push of that item's
    | JSON/Markdown into a dedicated git worktree. Prefer outbound webhooks →
    | CI when you only need rebuilds — this path is for teams that want files
    | in a repo. Disabled by default.
    |
    */

    'enabled' => (bool) env('GIT_EXPORT_ENABLED', false),

    'remote_url' => env('GIT_EXPORT_REMOTE_URL'),

    'branch' => env('GIT_EXPORT_BRANCH', 'main'),

    'work_dir' => env('GIT_EXPORT_WORK_DIR', storage_path('app/git-export')),

    /** Absolute path to a deploy private key (file on disk; never commit the key). */
    'ssh_key_path' => env('GIT_EXPORT_SSH_KEY_PATH'),

    /** json | markdown */
    'format' => env('GIT_EXPORT_FORMAT', 'json'),

    /** When true, write + commit locally but skip git push. */
    'dry_run' => (bool) env('GIT_EXPORT_DRY_RUN', false),

    /**
     * Comma-separated collection slugs to export, or * for all.
     */
    'collection_slugs' => env('GIT_EXPORT_COLLECTION_SLUGS', '*'),

    'commit_name' => env('GIT_EXPORT_COMMIT_NAME', 'Externa Git Export'),

    'commit_email' => env('GIT_EXPORT_COMMIT_EMAIL', 'git-export@externa.local'),

];
