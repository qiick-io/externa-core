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

    // Thin controllers (app-ui v0.2.0): existing debt, a ratchet. Lower an entry when the
    // controller shrinks; never raise it.
    'controllerPublicMethods' => [
        'App\Http\Controllers\Admin\FileController' => 30,
        'App\Http\Controllers\Admin\RoleController' => 8,
        'App\Http\Controllers\Admin\UserController' => 7,
        'App\Http\Controllers\Admin\UserGroupController' => 7,
        'App\Http\Controllers\Ai\AiConversationController' => 7,
        'App\Http\Controllers\Api\V1\CollectionItemController' => 8,
        'App\Http\Controllers\Api\V1\FileController' => 7,
        'App\Http\Controllers\Chat\ChatHubController' => 15,
        'App\Http\Controllers\Chat\ChatMessageController' => 31,
        'App\Http\Controllers\Collections\ContentCollectionController' => 11,
        'App\Http\Controllers\Collections\FieldController' => 12,
        'App\Http\Controllers\Collections\ItemChatController' => 20,
        'App\Http\Controllers\Collections\ItemController' => 22,
        'App\Http\Controllers\Settings\ProjectIntegrationsSettingsController' => 6,
    ],
];
