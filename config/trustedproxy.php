<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Trusted proxies
    |--------------------------------------------------------------------------
    |
    | Read by Laravel's TrustProxies middleware. Comma-separated IPs/CIDRs, or
    | `*` to trust the calling proxy. Unset = forwarded headers are ignored.
    |
    */

    'proxies' => env('TRUSTED_PROXIES'),
];
