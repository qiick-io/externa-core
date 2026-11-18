<?php

declare(strict_types=1);

use App\Ai\Tools\ManageCollections;
use App\Enums\ApiKeyScopeEnum;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Mcp\Adapters\RegistryMcpToolAdapter;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\PendingToolCall;
use App\Models\Role;
use App\Models\User;
use App\Services\Ai\AiToolExecutorService;
use App\Services\Collections\CollectionItemValuesAssemblerService;
use Database\Seeders\PermissionSeeder;
use Laravel\Ai\Tools\Request;

/**
 * AI write tools on by default and the schema tools (#766), read as refusals first: what the
 * defaults allow, what the switches and the key's own grants refuse, and a collection built
 * and filled end to end over MCP.
 *
 * Only `ai.mcp.enabled` is set here (the endpoint itself stays off by default); every write
 * and destructive setting is the shipped default unless a test says otherwise.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);

    config(['ai.mcp.enabled' => true, 'ai.mcp.rate_limit_per_minute' => 1000]);

    $this->role = Role::query()->create([
        'name' => 'mcp-schema-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $this->role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);

    $this->owner = User::factory()->create(['is_active' => true]);
    $this->owner->syncRoles([$this->role]);
});

/**
 * Owned key on the shared role; `mcp:write` + `collections:write` unless overridden.
 *
 * @param  array<string, mixed>  $attributes
 */
function schemaMcpKey(User $owner, Role $role, array $attributes = []): string
{
    $secret = ApiKey::generateSecret();

    ApiKey::query()->create([
        'name' => 'MCP schema key',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $role->id,
        'owner_id' => $owner->id,
        'created_by' => $owner->id,
        'scopes' => [ApiKeyScopeEnum::McpWrite->value, ApiKeyScopeEnum::CollectionsWrite->value],
        ...$attributes,
    ]);

    return $secret['plain'];
}

/**
 * One JSON-RPC call to `/mcp` with the bearer key; the decoded body.
 *
 * @param  array<string, mixed>  $params
 * @return array<string, mixed>
 */
function schemaMcpCall(string $plainKey, string $method, array $params = [], ?string $name = null): array
{
    $headers = [
        'Content-Type' => 'application/json',
        'Accept' => 'application/json, text/event-stream',
        'MCP-Protocol-Version' => '2026-07-28',
        'Mcp-Method' => $method,
        'Authorization' => 'Bearer '.$plainKey,
        ...($name !== null ? ['Mcp-Name' => $name] : []),
    ];

    return test()->postJson('/mcp', [
        'jsonrpc' => '2.0',
        'id' => 1,
        'method' => $method,
        'params' => [
            ...$params,
            '_meta' => [
                'io.modelcontextprotocol/protocolVersion' => '2026-07-28',
                'io.modelcontextprotocol/clientCapabilities' => new stdClass,
                'io.modelcontextprotocol/clientInfo' => ['name' => 'externa-pest', 'version' => '1.0.0'],
            ],
        ],
    ], $headers)->json();
}

/**
 * Call an MCP tool; `failed` and `text` (tool text or JSON-RPC error message) of the answer.
 *
 * @param  array<string, mixed>  $arguments
 * @return array{failed: bool, text: string}
 */
function schemaMcpTool(string $plainKey, string $tool, array $arguments = []): array
{
    $body = schemaMcpCall($plainKey, 'tools/call', ['name' => $tool, 'arguments' => $arguments], $tool);
    $text = $body['result']['structuredContent']['result']
        ?? $body['result']['content'][0]['text']
        ?? $body['error']['message']
        ?? '';

    return [
        'failed' => isset($body['error']) || ($body['result']['isError'] ?? false) === true,
        'text' => (string) $text,
    ];
}

/**
 * @return list<string>
 */
function schemaMcpToolNames(string $plainKey): array
{
    return collect(schemaMcpCall($plainKey, 'tools/list')['result']['tools'] ?? [])->pluck('name')->all();
}

describe('defaults', function (): void {
    it('lists and runs a write tool for an mcp:write key with the shipped config', function (): void {
        $key = schemaMcpKey($this->owner, $this->role);

        $created = schemaMcpTool($key, 'create_collection', ['name' => 'Recipes']);

        expect(schemaMcpToolNames($key))->toContain('create_collection', 'create_field', 'update_field', 'reorder_fields', 'create_item')
            ->and($created['failed'])->toBeFalse()
            ->and(Collection::query()->where('slug', 'recipes')->exists())->toBeTrue()
            ->and(PendingToolCall::query()->count())->toBe(0);
    });

    it('runs schema writes in the assistant with the shipped config', function (): void {
        $this->actingAs($this->owner);

        $result = (string) app(ManageCollections::class)->handle(new Request(['action' => 'create', 'name' => 'Recipes']));

        expect($result)->toContain('"created": true')
            ->and(Collection::query()->where('slug', 'recipes')->exists())->toBeTrue();
    });
});

describe('refusals', function (): void {
    it('refuses MCP writes when the write switch is off', function (string $switch): void {
        config([$switch => false]);
        $key = schemaMcpKey($this->owner, $this->role);

        $created = schemaMcpTool($key, 'create_collection', ['name' => 'Recipes']);

        expect($created['failed'])->toBeTrue()
            ->and(Collection::query()->count())->toBe(0);
    })->with(['ai.tools.write_enabled', 'ai.mcp.write_enabled']);

    it('neither lists nor runs schema tools for an mcp:read key', function (): void {
        $key = schemaMcpKey($this->owner, $this->role, [
            'scopes' => [ApiKeyScopeEnum::McpRead->value, ApiKeyScopeEnum::CollectionsWrite->value],
        ]);

        $created = schemaMcpTool($key, 'create_collection', ['name' => 'Recipes']);

        expect(schemaMcpToolNames($key))->toContain('list_collections')->not->toContain('create_collection')
            ->and($created['failed'])->toBeTrue()
            ->and(Collection::query()->count())->toBe(0);
    });

    it('refuses a schema change beyond the key own grants, though its owner may make it', function (array $keyAttributes, string $expectedError): void {
        $narrowRole = Role::query()->create(['name' => 'mcp-narrow-'.uniqid(), 'guard_name' => 'web']);
        $narrowRole->syncPermissions([PermissionEnum::CanUseAi->value, PermissionEnum::CanShowCollections->value]);
        $key = schemaMcpKey($this->owner, $keyAttributes['role'] ?? false ? $narrowRole : $this->role, array_diff_key($keyAttributes, ['role' => true]));

        $created = schemaMcpTool($key, 'create_collection', ['name' => 'Recipes']);

        expect($created['failed'])->toBeTrue()
            ->and($created['text'])->toContain($expectedError)
            ->and(Collection::query()->count())->toBe(0);
    })->with([
        'role without can-create-collections' => [['role' => true], 'role lacks the can-create-collections'],
        'collections:read only' => [['scopes' => [ApiKeyScopeEnum::McpWrite->value, ApiKeyScopeEnum::CollectionsRead->value]], 'collections:write'],
        'slug outside collection_slugs' => [['collection_slugs' => ['blog']], 'outside the API key collection list'],
    ]);

    it('refuses a field change on a collection outside the key collection_slugs', function (): void {
        $news = Collection::factory()->create(['slug' => 'news']);
        $key = schemaMcpKey($this->owner, $this->role, ['collection_slugs' => ['blog']]);

        $field = schemaMcpTool($key, 'create_field', ['collection_id' => $news->id, 'name' => 'title', 'type' => 'string']);

        expect($field['failed'])->toBeTrue()
            ->and($news->fields()->count())->toBe(0);
    });

    it('refuses the collection builder validation the UI applies', function (): void {
        Collection::factory()->create(['slug' => 'recipes']);
        $key = schemaMcpKey($this->owner, $this->role);

        $duplicate = schemaMcpTool($key, 'create_collection', ['name' => 'Recipes']);
        $collection = Collection::query()->where('slug', 'recipes')->sole();
        $badType = schemaMcpTool($key, 'create_field', ['collection_id' => $collection->id, 'name' => 'title', 'type' => 'no-such-type']);

        expect($duplicate['failed'])->toBeTrue()
            ->and($duplicate['text'])->toContain('Invalid slug')
            ->and($badType['failed'])->toBeTrue()
            ->and($badType['text'])->toContain('Invalid type')
            ->and($collection->fields()->count())->toBe(0);
    });

    it('refuses destructive actions by default in the assistant and the executor', function (): void {
        $this->actingAs($this->owner);
        $collection = Collection::factory()->create();

        $chat = (string) app(ManageCollections::class)->handle(new Request(['action' => 'delete', 'collection_id' => $collection->id]));
        $mcp = app(AiToolExecutorService::class)->execute(
            'ManageCollections',
            ['action' => 'delete', 'collection_id' => $collection->id],
            $this->owner,
            ['surface' => 'mcp'],
        );

        expect($chat)->toContain('AI_TOOLS_DESTRUCTIVE_ENABLED')
            ->and($mcp->status)->toBe('denied')
            ->and(PendingToolCall::query()->count())->toBe(0)
            ->and($collection->fresh()?->trashed())->toBeFalse();
    });

    it('stops a parked destructive call once destructive tools are switched off', function (): void {
        config(['ai.tools.destructive_enabled' => true]);
        $collection = Collection::factory()->create();
        $executor = app(AiToolExecutorService::class);

        $parked = $executor->execute('ManageCollections', ['action' => 'delete', 'collection_id' => $collection->id], $this->owner, ['surface' => 'mcp']);
        config(['ai.tools.destructive_enabled' => false]);
        $approved = $executor->approveAndExecute(PendingToolCall::query()->where('uuid', $parked->pendingId)->sole(), $this->owner);

        expect($parked->status)->toBe('pending_approval')
            ->and($approved->status)->toBe('denied')
            ->and($collection->fresh()?->trashed())->toBeFalse();
    });

    it('never runs user, role or group tools over MCP, even with destructive tools on', function (): void {
        config(['ai.tools.destructive_enabled' => true]);
        $this->owner->syncPermissions([PermissionEnum::CanShowUsers->value, PermissionEnum::CanCreateUsers->value]);

        $outcome = app(AiToolExecutorService::class)->execute(
            'ManageUsers',
            ['action' => 'create', 'name' => 'Agent', 'email' => 'agent@example.test'],
            $this->owner,
            ['surface' => 'mcp'],
        );

        $listedNames = collect(app(RegistryMcpToolAdapter::class)->listTools($this->owner))->pluck('name');

        expect($outcome->status)->toBe('denied')
            ->and($listedNames)->not->toContain('ManageUsers')
            ->and(PendingToolCall::query()->count())->toBe(0)
            ->and(User::query()->where('email', 'agent@example.test')->exists())->toBeFalse();
    });
});

it('builds a collection with fields over MCP, which the item tools then fill', function (): void {
    $key = schemaMcpKey($this->owner, $this->role);

    $created = json_decode(schemaMcpTool($key, 'create_collection', ['name' => 'Recipes'])['text'], true);
    $collectionId = (int) $created['collection']['id'];

    $title = json_decode(schemaMcpTool($key, 'create_field', [
        'collection_id' => $collectionId, 'name' => 'title', 'type' => 'string', 'settings_json' => '{"required": true}',
    ])['text'], true);
    $servings = json_decode(schemaMcpTool($key, 'create_field', [
        'collection_id' => $collectionId, 'name' => 'servings', 'type' => 'number',
    ])['text'], true);
    $renamed = schemaMcpTool($key, 'update_field', ['field_id' => $servings['field']['id'], 'name' => 'portions']);
    $reordered = schemaMcpTool($key, 'reorder_fields', [
        'collection_id' => $collectionId, 'field_ids' => [$servings['field']['id'], $title['field']['id']],
    ]);

    // The key's role holds no grant on a collection that did not exist when the role was set
    // up; an admin grants it in the roles matrix before the key can write items there.
    grantRoleActions($this->role, Collection::query()->findOrFail($collectionId), [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
    ]);

    $missingTitle = schemaMcpTool($key, 'create_item', ['collection_id' => $collectionId, 'data_json' => '{"portions": 2}']);
    $item = schemaMcpTool($key, 'create_item', [
        'collection_id' => $collectionId, 'data_json' => '{"title": "Risotto", "portions": 4}',
    ]);

    $fieldNamesInOrder = CollectionField::query()->where('collection_id', $collectionId)->ordered()->pluck('name')->all();
    $storedItem = CollectionItem::query()->where('collection_id', $collectionId)->sole();

    expect($renamed['failed'])->toBeFalse()
        ->and($reordered['failed'])->toBeFalse()
        ->and($fieldNamesInOrder)->toBe(['portions', 'title'])
        ->and($missingTitle['failed'])->toBeTrue()
        ->and($item['failed'])->toBeFalse()
        ->and(app(CollectionItemValuesAssemblerService::class)->assemble($storedItem))
        ->toMatchArray(['title' => 'Risotto', 'portions' => 4]);
});
