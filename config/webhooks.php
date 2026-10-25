<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Allow private / reserved hosts for outbound webhooks
    |--------------------------------------------------------------------------
    |
    | When false (default), webhook and Slack notifier URLs that point at
    | loopback, RFC1918, link-local, or other reserved ranges are rejected
    | on save and again at delivery time (SSRF). Self-hosted setups that
    | need LAN targets (e.g. n8n) may set WEBHOOKS_ALLOW_PRIVATE_HOSTS=true.
    |
    */

    'allow_private_hosts' => (bool) env('WEBHOOKS_ALLOW_PRIVATE_HOSTS', false),

];
