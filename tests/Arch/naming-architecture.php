<?php

declare(strict_types=1);

/**
 * This repo's settings for the shared `NamingArchitectureTest.php` (qiick standards).
 *
 * Written once by the sync, never overwritten or checked: it is this repo's own.
 * Repo-only rules (the #366 boolean renames) are in `BooleanRenameArchitectureTest.php`.
 */
return [
    'namespace' => 'App',

    'ignoring' => [
        // Deferred (#260): about 400 files predate strict types. New and touched
        // files must still declare it; shrink this to the remaining namespaces.
        'strict types' => ['App'],
        'Http\Middleware' => [
            // Starter-kit middleware, never renamed.
            'App\Http\Middleware\HandleAppearance',
            'App\Http\Middleware\HandleInertiaRequests',
        ],
        'traits' => [
            // Starter-kit validation-rule traits, never renamed.
            'App\Concerns',
        ],
    ],

    'suffixes' => [],
];
