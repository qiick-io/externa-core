<?php

declare(strict_types=1);

namespace App\Data\Mcp;

use App\Enums\ApiKeyScopeEnum;
use App\Http\Requests\Mcp\ApproveMcpClientRequest;
use App\Models\User;
use Laravel\Passport\Client;

/**
 * What a user approved on the consent screen for a remote MCP client (#802), as
 * {@see ApproveMcpClientRequest} validated it: the same narrowing an API key carries.
 */
final readonly class McpClientGrantData
{
    /**
     * @param  list<ApiKeyScopeEnum>  $scopes  one per resource, the highest approved
     * @param  list<string>|null  $collectionSlugs  null = every collection the role may reach
     * @param  string  $redirectUri  where the authorization returns, recorded in the audit entry
     */
    public function __construct(
        public User $user,
        public Client $client,
        public string $redirectUri,
        public int $roleId,
        public array $scopes,
        public ?array $collectionSlugs,
    ) {}

}
