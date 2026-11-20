<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| laravel/mcp
|--------------------------------------------------------------------------
|
| Only the keys externa sets; the package defaults fill the rest. The MCP
| endpoint itself is configured under `ai.mcp` (config/ai.php).
|
| redirect_domains / custom_schemes: which redirect URIs a remote MCP client
| may register through dynamic client registration (#802). `*` allows any
| http(s) URL; the consent screen always shows the host a grant returns to.
| Desktop clients such as Cursor or VS Code need their private-use scheme
| listed (RFC 8252).
|
*/

return [
    'redirect_domains' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('MCP_OAUTH_REDIRECT_DOMAINS', '*')),
    ))),

    'custom_schemes' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('MCP_OAUTH_CUSTOM_SCHEMES', '')),
    ))),
];
