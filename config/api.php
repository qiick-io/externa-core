<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default API key rate limit
    |--------------------------------------------------------------------------
    |
    | Requests per minute when an API key has no explicit rate_limit_per_minute.
    | Anonymous (public) traffic uses the route throttle middleware only.
    |
    */

    'default_rate_limit_per_minute' => (int) env('API_KEY_RATE_LIMIT', 60),

    /*
    |--------------------------------------------------------------------------
    | Request cost budget (60 s window)
    |--------------------------------------------------------------------------
    |
    | Extra abuse control stacked after ResolveApiAccess. 0 = disabled
    | (open default until operators set API_COST_LIMIT).
    |
    */

    'cost_limit' => (int) env('API_COST_LIMIT', 0),

    'cost' => [
        'base' => (int) env('API_COST_BASE', 1),
        'include' => (int) env('API_COST_INCLUDE', 2),
        'mutation' => (int) env('API_COST_MUTATION', 5),
    ],

    /*
    |--------------------------------------------------------------------------
    | Payload caps
    |--------------------------------------------------------------------------
    |
    | max_body_bytes: 0 = disabled. max_per_page: existing Public API ceiling
    | made configurable (default 100, same as hard-coded before #113).
    |
    */

    'max_body_bytes' => (int) env('API_MAX_BODY_BYTES', 0),

    'max_per_page' => (int) env('API_MAX_PER_PAGE', 100),

];
