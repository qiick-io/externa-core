<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Meilisearch sync (optional site search index)
    |--------------------------------------------------------------------------
    |
    | When disabled or host empty, sync jobs are no-ops. Index published
    | collection item values for headless / starter search — not admin SQL filters.
    |
    */

    'enabled' => (bool) env('MEILISEARCH_ENABLED', false),

    'host' => rtrim((string) env('MEILISEARCH_HOST', ''), '/'),

    'api_key' => env('MEILISEARCH_API_KEY'),

    'index' => env('MEILISEARCH_INDEX', 'externa'),

    /*
    | When the item `data` bag has a `status` field, only these values stay indexed.
    | Empty allowlist = ignore status (index whenever published values exist).
    */
    'indexable_statuses' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('MEILISEARCH_INDEXABLE_STATUSES', 'published')),
    ))),

];
