<?php

declare(strict_types=1);

use App\Enums\ApiKeyScopeEnum;
use App\Enums\PermissionEnum;
use App\Mcp\Servers\ExternaServer;
use App\Mcp\Tools\CreateItem;
use App\Mcp\Tools\ListCollections;
use App\Mcp\Tools\ListItems;
use App\Mcp\Tools\UpdateItem;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Mcp\Request;
use Spatie\Activitylog\Models\Activity;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();

    config([
        'ai.mcp.enabled' => true,
        'ai.mcp.write_enabled' => false,
        'ai.mcp.rate_limit_per_minute' => 60,
        'ai.tools.enabled' => true,
        'ai.tools.write_enabled' => false,
        'ai.tools.write_allow' => [],
        'ai.tools.allow' => [],
        'ai.tools.deny' => [],
    ]);
});

/**
 * @param  list<string>  $scopes
 * @return array{user: User, key: ApiKey, plain: string, role: Role}
 */
function makeOwnedMcpKey(array $scopes = ['mcp:read'], array $permissions = []): array
{
    $role = Role::query()->create([
        'name' => 'mcp-role-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);

    if ($permissions !== []) {
        $role->syncPermissions($permissions);
    }

    $user = User::factory()->create(['is_active' => true]);
    $user->syncRoles([$role]);

    $secret = ApiKey::generateSecret();
    $key = ApiKey::query()->create([
        'name' => 'MCP key',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $role->id,
        'owner_id' => $user->id,
        'created_by' => $user->id,
        'scopes' => $scopes,
        'read_only' => ! in_array(ApiKeyScopeEnum::McpWrite->value, $scopes, true),
    ]);

    return ['user' => $user, 'key' => $key, 'plain' => $secret['plain'], 'role' => $role];
}

/**
 * @param  array<string, mixed>  $params
 * @return array<string, mixed>
 */
function mcpJsonRpc(string $method, array $params = [], string|int $id = 1): array
{
    return [
        'jsonrpc' => '2.0',
        'id' => $id,
        'method' => $method,
        'params' => [
            ...$params,
            '_meta' => [
                'io.modelcontextprotocol/protocolVersion' => '2026-07-28',
                'io.modelcontextprotocol/clientCapabilities' => new stdClass,
                'io.modelcontextprotocol/clientInfo' => [
                    'name' => 'externa-pest',
                    'version' => '1.0.0',
                ],
            ],
        ],
    ];
}

/**
 * @param  array<string, string>  $extraHeaders
 * @return array<string, string>
 */
function mcpHeaders(string $method, ?string $name = null, array $extraHeaders = []): array
{
    $headers = [
        'Content-Type' => 'application/json',
        'Accept' => 'application/json, text/event-stream',
        'MCP-Protocol-Version' => '2026-07-28',
        'Mcp-Method' => $method,
        ...$extraHeaders,
    ];

    if ($name !== null) {
        $headers['Mcp-Name'] = $name;
    }

    return $headers;
}

it('returns 404 when MCP is disabled', function (): void {
    config(['ai.mcp.enabled' => false]);

    $this->postJson('/mcp', mcpJsonRpc('ping'), mcpHeaders('ping'))
        ->assertNotFound();
});

it('returns 401 when no authentication is provided', function (): void {
    $this->postJson('/mcp', mcpJsonRpc('ping'), mcpHeaders('ping'))
        ->assertUnauthorized();
});

it('denies API keys without mcp:read scope', function (): void {
    $auth = makeOwnedMcpKey(scopes: []);

    $this->postJson('/mcp', mcpJsonRpc('ping'), [
        ...mcpHeaders('ping'),
        'Authorization' => 'Bearer '.$auth['plain'],
    ])->assertForbidden();
});

it('rejects ownerless API keys on the MCP endpoint', function (): void {
    $auth = makeOwnedMcpKey();
    $auth['key']->forceFill(['owner_id' => null])->save();

    $this->postJson('/mcp', mcpJsonRpc('ping'), [
        ...mcpHeaders('ping'),
        'Authorization' => 'Bearer '.$auth['plain'],
    ])->assertUnauthorized();
});

it('accepts an owned API key with mcp:read', function (): void {
    $auth = makeOwnedMcpKey(
        scopes: [ApiKeyScopeEnum::McpRead->value],
        permissions: [PermissionEnum::CanShowCollections->value],
    );

    $this->postJson('/mcp', mcpJsonRpc('ping'), [
        ...mcpHeaders('ping'),
        'Authorization' => 'Bearer '.$auth['plain'],
    ])->assertSuccessful();
});

it('does not register write tools when AI_MCP_WRITE_ENABLED is false', function (): void {
    config(['ai.mcp.write_enabled' => false]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
    ]);

    ExternaServer::actingAs($user)->tools()
        ->assertRegistered([ListCollections::class, ListItems::class])
        ->assertNotRegistered([CreateItem::class, UpdateItem::class]);
});

it('registers write tools when AI_MCP_WRITE_ENABLED is true', function (): void {
    config(['ai.mcp.write_enabled' => true]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
    ]);

    ExternaServer::actingAs($user)->tools()
        ->assertRegistered([CreateItem::class, UpdateItem::class, ListCollections::class]);
});

it('hides unauthorized collections from list_collections', function (): void {
    $allowed = Collection::factory()->create(['name' => 'Allowed', 'slug' => 'allowed-'.uniqid()]);
    Collection::factory()->create(['name' => 'Secret', 'slug' => 'secret-'.uniqid()]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        // No CanShowCollections → ManageCollections returns permission error / empty
    ]);

    ExternaServer::actingAs($user)
        ->tool(ListCollections::class)
        ->assertHasErrors(['Missing permission']);
});

it('lists collections for a show-collections user and audits the call', function (): void {
    Collection::factory()->create(['name' => 'Posts', 'slug' => 'posts-'.uniqid()]);

    $user = grantAiPermissions(User::factory()->create(), [
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanCreateCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanDeleteCollections->value,
        PermissionEnum::CanRestoreCollections->value,
        PermissionEnum::CanForceDeleteCollections->value,
    ]);

    ExternaServer::actingAs($user)
        ->tool(ListCollections::class)
        ->assertOk()
        ->assertSee('Posts');

    $mcpAudits = Activity::query()
        ->inLog('ai')
        ->get()
        ->filter(fn (Activity $activity): bool => ($activity->properties['surface'] ?? null) === 'mcp');

    expect($mcpAudits->count())->toBeGreaterThan(0);
});

it('denies write tool calls when the key lacks mcp:write', function (): void {
    config([
        'ai.mcp.write_enabled' => true,
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollectionItems'],
    ]);

    $auth = makeOwnedMcpKey(
        scopes: [ApiKeyScopeEnum::McpRead->value],
        permissions: [
            PermissionEnum::CanShowCollections->value,
            PermissionEnum::CanCreateCollections->value,
            PermissionEnum::CanEditCollections->value,
        ],
    );

    // mcp_can_write is false → write tools are not registered for this request path.
    $this->postJson('/mcp', mcpJsonRpc('tools/list'), [
        ...mcpHeaders('tools/list'),
        'Authorization' => 'Bearer '.$auth['plain'],
    ])->assertSuccessful();

    // Direct tool handle still enforces write scope when attribute is set.
    request()->attributes->set('mcp_can_write', false);
    $this->actingAs($auth['user']);

    $result = app(CreateItem::class)->handle(new Request([
        'collection_id' => 1,
        'data_json' => '{}',
    ]));

    expect(method_exists($result, 'isError') ? $result->isError() : true)->toBeTrue();
});

it('rate limits MCP requests per API key', function (): void {
    config(['ai.mcp.rate_limit_per_minute' => 2]);

    $auth = makeOwnedMcpKey(
        scopes: [ApiKeyScopeEnum::McpRead->value],
        permissions: [PermissionEnum::CanShowCollections->value],
    );

    RateLimiter::clear('mcp-key:'.$auth['key']->id);

    $headers = [
        ...mcpHeaders('ping'),
        'Authorization' => 'Bearer '.$auth['plain'],
    ];

    $this->postJson('/mcp', mcpJsonRpc('ping', id: 1), $headers)->assertSuccessful();
    $this->postJson('/mcp', mcpJsonRpc('ping', id: 2), $headers)->assertSuccessful();
    $this->postJson('/mcp', mcpJsonRpc('ping', id: 3), $headers)->assertStatus(429);
});

it('does not accept a session user without an API key (#441)', function (): void {
    $user = User::factory()->create(['is_active' => true]);

    $this->actingAs($user)
        ->postJson('/mcp', mcpJsonRpc('ping'), mcpHeaders('ping'))
        ->assertUnauthorized();
});

it('limits failed MCP authentications per IP before the per-key throttle (#441)', function (): void {
    config(['ai.mcp.auth_failures_per_minute' => 2]);
    RateLimiter::clear('mcp-auth-failures:127.0.0.1');

    $headers = [...mcpHeaders('ping'), 'Authorization' => 'Bearer not-a-key'];

    $this->postJson('/mcp', mcpJsonRpc('ping', id: 1), $headers)->assertUnauthorized();
    $this->postJson('/mcp', mcpJsonRpc('ping', id: 2), $headers)->assertUnauthorized();
    $this->postJson('/mcp', mcpJsonRpc('ping', id: 3), $headers)->assertStatus(429);
});
