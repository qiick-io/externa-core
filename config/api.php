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

];
