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
        // Ratchet (#281): the files that predate strict types, one class each. Only shrinks;
        // RatchetArchitectureTest fails on a stale entry or an unlisted file.
        'strict types' => require __DIR__.'/strict-types-baseline.php',
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

    // Thin controllers (app-ui v0.2.0): the debt is paid off (#598), so the five public
    // methods cap is now enforced for every controller. Never add an entry here.
    'controllerPublicMethods' => [],
];
