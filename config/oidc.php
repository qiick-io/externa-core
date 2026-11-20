<?php

declare(strict_types=1);

/*
 * Externa's overrides of the qiick/laravel-oidc defaults (vendor/qiick/laravel-oidc/config/oidc.php).
 * Only these top-level keys are replaced; every other key keeps the package default.
 *
 * The provider (issuer, client id and secret), JIT, auto-link, SSO-only mode, allowed domains
 * and the button label are NOT read from here or from OIDC_* env vars: they come from
 * Settings → Authentication & Security (AppServiceProvider::registerOidcBindings()). Only the
 * Docker and lab variables of `http` are env vars.
 *
 * Package route registration is off: `routes/web.php` registers the same three paths so the
 * callback can dual-read `users.oidc_sub` for one release (LegacyOidcSubjectBridgeService)
 * before the package links the identity. While SSO is off the routes still answer 404 through
 * OidcSettingsRepositoryService::isEnabled().
 */
return [

    /*
     * Unused while the app owns the callback (Fortify LoginResponse picks the home path). Kept
     * so a future switch back to the package callback stays permission-aware via `/`.
     */
    'home' => '/',

    /*
     * 1.5 parity: SSO logins keep Laravel's remember-me cookie. The package default is off
     * (a remember cookie can outlive a back-channel logout); Externa keeps the previous behaviour.
     */
    'remember' => true,

    /*
     * Algorithms accepted for the signed id_token (asymmetric only). Wider than the package
     * default (RS256 alone) so IdPs that sign with PS256 / ES256 / ES384 keep working.
     */
    'id_token' => [

        'algorithms' => ['RS256', 'PS256', 'ES256', 'ES384'],

    ],

    'users' => [

        'active_column' => 'is_active',

    ],

    /*
     * Routes are registered in `routes/web.php` (same paths and names) so the callback can run
     * the legacy-subject bridge. Throttle lives on redirect only (60/min per IP); the callback
     * is exempt so a shared office IP is not locked out mid-login.
     */
    'routes' => [

        'enabled' => false,

        'prefix' => 'auth/oidc',

        'middleware' => ['web', 'guest'],

    ],

    /*
     * The package defaults, listed so .env.example documents their env vars. `discovery_base` and
     * `server_origin` serve Docker setups where the app reaches the IdP under another host than
     * the browser; `allow_private_hosts` lets the SSRF guard accept a private-network IdP.
     */
    'http' => [

        'timeout' => 10,

        'discovery_base' => env('OIDC_DISCOVERY_BASE'),

        'server_origin' => env('OIDC_SERVER_ORIGIN'),

        'allow_private_hosts' => (bool) env('OIDC_ALLOW_PRIVATE_HOSTS', false),

    ],

];
