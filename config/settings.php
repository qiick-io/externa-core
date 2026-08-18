<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Appearance setting keys (project scope)
    |--------------------------------------------------------------------------
    */

    'appearance' => [
        'keys' => [
            'project_color',
            'project_color_dark',
            'project_logo',
            'project_logo_dark',
            'public_favicon',
            'default_appearance',
        ],
        'defaults' => [
            'project_color' => null,
            'project_color_dark' => null,
            'project_logo' => null,
            'project_logo_dark' => null,
            'public_favicon' => null,
            'default_appearance' => 'system',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Project setting keys (project scope)
    |--------------------------------------------------------------------------
    */

    'project' => [
        'keys' => [
            'name',
            'description',
            'url',
            'default_language',
            'content_locales',
            'default_content_locale',
            'fallback_content_locales',
            'sidebar_modules',
            'password_policy',
            'login_max_attempts',
            'registration_enabled',
            'default_user_role',
            'email_verification_required',
            'two_factor_required',
            'allowed_domains',
            'public_api_allowed_origins',
            'allowed_transformations',
            'preset_transformations',
            'report_issue_url',
            'report_bug_url',
            'report_error_url',
            'webhook_url',
            'webhook_secret',
            'revision_retention_count',
            'revision_retention_days',
        ],
        'defaults' => [
            'name' => null,
            'description' => null,
            'url' => null,
            'default_language' => 'en',
            // Seed from config/collections.php; project settings become source of truth once saved
            'content_locales' => null,
            'default_content_locale' => null,
            'fallback_content_locales' => null,
            'sidebar_modules' => [
                // ai is pinned first + locked (always on); dashboard is locked but reorderable below
                ['id' => 'ai', 'enabled' => true, 'locked' => true],
                ['id' => 'dashboard', 'enabled' => true, 'locked' => true],
                ['id' => 'files', 'enabled' => true, 'locked' => false],
                ['id' => 'collections', 'enabled' => true, 'locked' => false],
                ['id' => 'chat', 'enabled' => true, 'locked' => false],
                ['id' => 'activity', 'enabled' => true, 'locked' => false],
                ['id' => 'users', 'enabled' => true, 'locked' => false],
                ['id' => 'groups', 'enabled' => true, 'locked' => false],
                ['id' => 'settings', 'enabled' => true, 'locked' => false],
            ],
            // ponytail: weak matches prior non-prod Password::defaults(null); tighten via settings UI
            'password_policy' => 'weak',
            'login_max_attempts' => 5,
            'registration_enabled' => true,
            'default_user_role' => null,
            'email_verification_required' => false,
            'two_factor_required' => false,
            'allowed_domains' => [],
            'public_api_allowed_origins' => [],
            'allowed_transformations' => ['thumbnail'],
            // Structured image presets (GD-backed; see FileTransformService)
            'preset_transformations' => [
                [
                    'key' => 'thumbnail',
                    'fit' => 'contain',
                    'width' => 128,
                    'height' => 128,
                    'quality' => 82,
                    'without_enlargement' => true,
                    'format' => 'auto',
                ],
                [
                    'key' => 'small',
                    'fit' => 'contain',
                    'width' => 64,
                    'height' => 64,
                    'quality' => 82,
                    'without_enlargement' => true,
                    'format' => 'auto',
                ],
                [
                    'key' => 'medium',
                    'fit' => 'contain',
                    'width' => 256,
                    'height' => 256,
                    'quality' => 82,
                    'without_enlargement' => true,
                    'format' => 'auto',
                ],
            ],
            'report_issue_url' => null,
            // Fallback for settings nav + Project settings form; empty/null overrides stay empty
            'report_bug_url' => 'https://github.com/qiick-io/externa-core/issues/new?template=bug_report.yml',
            'report_error_url' => null,
            'webhook_url' => null,
            // Stored encrypted via Crypt; never share plaintext on Inertia shared()
            'webhook_secret' => null,
            // Null = unlimited; collections can override per axis
            'revision_retention_count' => null,
            'revision_retention_days' => null,
        ],
        'sidebar_module_ids' => [
            'ai',
            'dashboard',
            'files',
            'collections',
            'chat',
            'activity',
            'users',
            'groups',
            'settings',
        ],
        // Always rendered/stored first; not drag-reorderable in settings UI
        'sidebar_pinned_module_ids' => [
            'ai',
        ],
        'password_policies' => ['weak', 'medium', 'strong'],
        'allowed_transformations' => ['thumbnail'],
        // Fits mapped in FileTransformService (GD). Formats limited to what GD can encode.
        'transform_fits' => ['contain', 'cover', 'inside', 'outside'],
        'transform_formats' => ['auto', 'jpeg', 'png', 'webp'],
    ],

];
