<?php

declare(strict_types=1);

use App\Enums\ApiKeyScopeEnum;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FileAccessEnum;
use App\Enums\FilePermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Models\CollectionPermission;
use App\Models\PendingToolCall;
use App\Models\Role;
use App\Models\User;
use App\Services\Ai\AiToolExecutorService;
use App\Services\Api\CollectionPermissionGuardService;
use App\Services\Collections\CollectionItemDataNormalizerService;
use App\Services\Collections\CollectionItemValuesWriterService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;

/**
 * AuthZ parity for every MCP resource and tool under a scoped API key (#435).
 *
 * The key is limited to `collection_slugs=[blog]`; `news` is granted to the role and owner
 * so only the key scope can hide it. `blog.internal_note` is unreadable by field ACL. File
 * cases drop the `files:*` scope, flip `read_private`, and narrow the key to `:read`; write cases check the executor
 * (kill switch, allowlist, approval).
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    Storage::fake('assets');

    config([
        'ai.mcp.enabled' => true,
        'ai.mcp.write_enabled' => true,
        'ai.mcp.rate_limit_per_minute' => 1000,
        'ai.tools.enabled' => true,
        'ai.tools.write_enabled' => true,
        'ai.tools.write_allow' => ['ManageCollectionItems', 'ManageFiles'],
        'ai.tools.allow' => [],
        'ai.tools.deny' => [],
    ]);

    $this->role = Role::query()->create([
        'name' => 'mcp-parity-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $this->role->syncPermissions([
        PermissionEnum::CanUseAi->value,
        ...allCollectionPermissions(),
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
    ]);

    $this->owner = User::factory()->create(['is_active' => true]);
    $this->owner->syncRoles([$this->role]);

    $this->blog = Collection::factory()->create(['name' => 'Blog', 'slug' => 'blog', 'versioning' => true]);
    $this->news = Collection::factory()->create(['name' => 'News', 'slug' => 'news', 'versioning' => true]);

    foreach ([$this->blog, $this->news] as $collection) {
        CollectionField::factory()->create([
            'collection_id' => $collection->id,
            'name' => 'title',
            'type' => 'string',
            'translatable' => false,
        ]);
        grantRoleActions($this->role, $collection, [
            CollectionPermissionActionEnum::Read,
            CollectionPermissionActionEnum::Create,
            CollectionPermissionActionEnum::Update,
        ]);
    }

    CollectionField::factory()->create([
        'collection_id' => $this->blog->id,
        'name' => 'internal_note',
        'type' => 'string',
        'translatable' => false,
    ]);
    CollectionPermission::query()
        ->where('role_id', $this->role->id)
        ->where('collection_id', $this->blog->id)
        ->get()
        ->each(fn (CollectionPermission $permission) => $permission->update(['rules' => [
            'fields' => [
                'title' => ['read' => true, 'create' => true, 'update' => true],
                'internal_note' => ['read' => false, 'create' => false, 'update' => false],
            ],
            'item_filter' => null,
        ]]));
    app(CollectionPermissionGuardService::class)->forget($this->role->id);

    $this->blogItem = mcpParityItem($this->blog, 'Blog post', ['internal_note' => 'Do not leak']);
    $this->newsItem = mcpParityItem($this->news, 'Secret news');

    $this->publicFile = makeStoredFile('public.jpg');
    $this->privateFile = makeStoredFile('private.jpg');
    $this->privateFile->update(['access' => FileAccessEnum::Private->value]);

    grantFileActions($this->role, [FilePermissionActionEnum::Read, FilePermissionActionEnum::Update]);
});

/**
 * Item with published values and a pending draft (so publish_item has work to do).
 *
 * @param  array<string, mixed>  $extraValues
 */
function mcpParityItem(Collection $collection, string $title, array $extraValues = []): CollectionItem
{
    $collection = $collection->fresh(['fields']);
    $item = CollectionItem::query()->create(['collection_id' => $collection->id]);

    app(CollectionItemValuesWriterService::class)->sync(
        $item,
        $collection,
        app(CollectionItemDataNormalizerService::class)->normalize($collection, ['title' => $title, ...$extraValues], true),
    );
    $item->forceFill(['draft_data' => ['title' => $title.' (draft)']])->save();

    return $item;
}

/**
 * Owned MCP key on the shared role, scoped to `blog` unless overridden.
 *
 * @param  array<string, mixed>  $attributes
 */
function mcpParityKey(User $owner, Role $role, array $attributes = []): string
{
    $secret = ApiKey::generateSecret();

    ApiKey::query()->create([
        'name' => 'MCP parity key',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $role->id,
        'owner_id' => $owner->id,
        'created_by' => $owner->id,
        'scopes' => [
            ApiKeyScopeEnum::McpWrite->value,
            ApiKeyScopeEnum::CollectionsWrite->value,
            ApiKeyScopeEnum::FilesWrite->value,
        ],
        'collection_slugs' => ['blog'],
        ...$attributes,
    ]);

    return $secret['plain'];
}

/**
 * Send one JSON-RPC call to `/mcp` with the bearer key and return the decoded body.
 *
 * @param  array<string, mixed>  $params
 * @return array<string, mixed>
 */
function mcpParityCall(string $plainKey, string $method, array $params, ?string $name = null): array
{
    $headers = [
        'Content-Type' => 'application/json',
        'Accept' => 'application/json, text/event-stream',
        'MCP-Protocol-Version' => '2026-07-28',
        'Mcp-Method' => $method,
        'Authorization' => 'Bearer '.$plainKey,
    ];

    if ($name !== null) {
        $headers['Mcp-Name'] = $name;
    }

    $response = test()->postJson('/mcp', [
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
    ], $headers);

    // laravel/mcp answers resource errors with HTTP 500 + a JSON-RPC error body.
    return $response->json();
}

/**
 * @param  array<string, mixed>  $arguments
 * @return array<string, mixed>
 */
function mcpParityTool(string $plainKey, string $tool, array $arguments = []): array
{
    return mcpParityCall($plainKey, 'tools/call', ['name' => $tool, 'arguments' => $arguments], $tool);
}

/**
 * @return array<string, mixed>
 */
function mcpParityResource(string $plainKey, string $uri): array
{
    return mcpParityCall($plainKey, 'resources/read', ['uri' => $uri], $uri);
}

/**
 * Tool text, resource text, or JSON-RPC error message of an MCP response body.
 *
 * @param  array<string, mixed>  $body
 */
function mcpParityText(array $body): string
{
    return (string) ($body['result']['content'][0]['text']
        ?? $body['result']['contents'][0]['text']
        ?? $body['error']['message']
        ?? '');
}

/**
 * @param  array<string, mixed>  $body
 */
function mcpParityFailed(array $body): bool
{
    return isset($body['error']) || ($body['result']['isError'] ?? false) === true;
}

describe('collection resources and tools', function (): void {
    it('lists only collections inside the key collection_slugs', function (): void {
        $key = mcpParityKey($this->owner, $this->role);

        $index = mcpParityText(mcpParityResource($key, 'externa://collections'));
        $tool = mcpParityText(mcpParityTool($key, 'list_collections'));

        expect($index)->toContain('"blog"')->not->toContain('"news"')
            ->and($tool)->toContain('"blog"')->not->toContain('"news"');
    });

    it('hides out-of-scope schemas and unreadable fields', function (): void {
        $key = mcpParityKey($this->owner, $this->role);

        $schemaOutOfScope = mcpParityResource($key, 'externa://collections/news/schema');
        $describeOutOfScope = mcpParityTool($key, 'describe_collection', ['collection_id' => $this->news->id]);
        $schema = mcpParityText(mcpParityResource($key, 'externa://collections/blog/schema'));
        $described = mcpParityText(mcpParityTool($key, 'describe_collection', ['collection_id' => $this->blog->id]));

        expect(mcpParityFailed($schemaOutOfScope))->toBeTrue()
            ->and(mcpParityFailed($describeOutOfScope))->toBeTrue()
            ->and($schema)->toContain('title')->not->toContain('internal_note')
            ->and($described)->toContain('title')->not->toContain('internal_note');
    });

    it('denies items outside the key scope and strips unreadable fields', function (): void {
        $key = mcpParityKey($this->owner, $this->role);
        $newsItemId = $this->newsItem->id;

        $deniedBodies = [
            'resource' => mcpParityResource($key, 'externa://items/news/'.$newsItemId),
            'get_item' => mcpParityTool($key, 'get_item', ['item_id' => $newsItemId]),
            'list_items' => mcpParityTool($key, 'list_items', ['collection_id' => $this->news->id]),
            'search' => mcpParityTool($key, 'search', ['collection_id' => $this->news->id, 'query' => 'Secret']),
        ];

        foreach ($deniedBodies as $surface => $body) {
            expect(mcpParityFailed($body))->toBeTrue($surface)
                ->and(mcpParityText($body))->not->toContain('Secret news');
        }

        $resource = mcpParityText(mcpParityResource($key, 'externa://items/blog/'.$this->blogItem->id));
        $getItem = mcpParityText(mcpParityTool($key, 'get_item', ['item_id' => $this->blogItem->id]));

        expect($resource)->toContain('Blog post')->not->toContain('Do not leak')
            ->and($getItem)->toContain('Blog post')->not->toContain('Do not leak');
    });
});

describe('file resources and tools', function (): void {
    it('hides private files without read_private', function (): void {
        $key = mcpParityKey($this->owner, $this->role);

        $resource = mcpParityResource($key, 'externa://files/'.$this->privateFile->id);
        $getFile = mcpParityTool($key, 'get_file', ['file_id' => $this->privateFile->id]);
        $listFiles = mcpParityText(mcpParityTool($key, 'list_files', ['query' => '.jpg']));
        $publicFile = mcpParityText(mcpParityResource($key, 'externa://files/'.$this->publicFile->id));

        expect(mcpParityFailed($resource))->toBeTrue()
            ->and(mcpParityFailed($getFile))->toBeTrue()
            ->and($listFiles)->toContain('public.jpg')->not->toContain('private.jpg')
            ->and($publicFile)->toContain('public.jpg');
    });

    it('shows private files once the role and owner hold read_private', function (): void {
        grantFileActions($this->role, [FilePermissionActionEnum::ReadPrivate]);
        $key = mcpParityKey($this->owner, $this->role);

        expect(mcpParityText(mcpParityResource($key, 'externa://files/'.$this->privateFile->id)))->toContain('private.jpg')
            ->and(mcpParityText(mcpParityTool($key, 'list_files', ['query' => '.jpg'])))->toContain('private.jpg');
    });

    it('denies every file surface without a files scope', function (): void {
        $key = mcpParityKey($this->owner, $this->role, [
            'scopes' => [ApiKeyScopeEnum::McpWrite->value, ApiKeyScopeEnum::CollectionsWrite->value],
        ]);
        $fileId = $this->publicFile->id;

        $deniedBodies = [
            'resource' => mcpParityResource($key, 'externa://files/'.$fileId),
            'get_file' => mcpParityTool($key, 'get_file', ['file_id' => $fileId]),
            'list_files' => mcpParityTool($key, 'list_files'),
            'tag_file' => mcpParityTool($key, 'tag_file', ['file_id' => $fileId, 'tags_json' => '["hero"]']),
            'move_file' => mcpParityTool($key, 'move_file', ['file_id' => $fileId, 'target_parent_id' => 0]),
        ];

        foreach ($deniedBodies as $surface => $body) {
            expect(mcpParityFailed($body))->toBeTrue($surface)
                ->and(mcpParityText($body))->not->toContain('public.jpg');
        }

        expect(PendingToolCall::query()->count())->toBe(0);
    });
});

describe('write tools', function (): void {
    // The approval path: since #766 MCP writes park only with AI_MCP_WRITE_REQUIRES_APPROVAL.
    beforeEach(function (): void {
        config(['ai.mcp.write_requires_approval' => true]);
    });

    it('runs in-scope publish_item and tag_file directly for an mcp:write key by default', function (): void {
        config(['ai.mcp.write_requires_approval' => false]);
        $key = mcpParityKey($this->owner, $this->role);

        $publish = mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);
        $tag = mcpParityTool($key, 'tag_file', ['file_id' => $this->publicFile->id, 'tags_json' => '["hero"]']);

        expect(mcpParityFailed($publish))->toBeFalse()
            ->and(mcpParityFailed($tag))->toBeFalse()
            ->and(PendingToolCall::query()->count())->toBe(0)
            ->and($this->blogItem->fresh()->draft_data)->toBeNull()
            ->and($this->publicFile->fresh()->tags)->toHaveCount(1);
    });

    it('still refuses out-of-scope writes when they run directly', function (): void {
        config(['ai.mcp.write_requires_approval' => false]);
        $key = mcpParityKey($this->owner, $this->role);

        $body = mcpParityTool($key, 'publish_item', ['item_id' => $this->newsItem->id]);

        expect(mcpParityFailed($body))->toBeTrue()
            ->and($this->newsItem->fresh()->draft_data)->not->toBeNull();
    });

    it('parks in-scope publish_item and tag_file for approval instead of writing', function (): void {
        $key = mcpParityKey($this->owner, $this->role);

        $publish = mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);
        $tag = mcpParityTool($key, 'tag_file', ['file_id' => $this->publicFile->id, 'tags_json' => '["hero"]']);

        expect(mcpParityText($publish))->toContain('pending_approval')
            ->and(mcpParityText($tag))->toContain('pending_approval')
            ->and(PendingToolCall::query()->pluck('tool')->sort()->values()->all())
            ->toBe(['ManageCollectionItems', 'ManageFiles'])
            ->and($this->blogItem->fresh()->draft_data)->not->toBeNull()
            ->and($this->publicFile->fresh()->tags)->toHaveCount(0);
    });

    it('stores the requesting key on the parked call', function (): void {
        $key = mcpParityKey($this->owner, $this->role);

        mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);

        expect(PendingToolCall::query()->sole()->api_key_id)
            ->toBe(ApiKey::query()->where('key_hash', ApiKey::hashSecret($key))->value('id'));
    });

    it('runs an approved call under the key scopes, checked again at approval (#441)', function (): void {
        $key = mcpParityKey($this->owner, $this->role, ['collection_slugs' => ['blog', 'news']]);
        mcpParityTool($key, 'publish_item', ['item_id' => $this->newsItem->id]);
        $pending = PendingToolCall::query()->sole();

        // The key is narrowed while the call waits; the owner's own role still reads news.
        ApiKey::query()->whereKey($pending->api_key_id)->update(['collection_slugs' => json_encode(['blog'])]);

        $outcome = app(AiToolExecutorService::class)->approveAndExecute($pending, $this->owner);

        // The tool runs, and the key's collection scope refuses it: the draft stays unpublished.
        expect($outcome->result)->toContain('unauthorized for the collection')
            ->and($this->newsItem->fresh()->draft_data)->not->toBeNull();
    });

    it('refuses to run an approved call whose key was revoked', function (): void {
        $key = mcpParityKey($this->owner, $this->role);
        mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);
        $pending = PendingToolCall::query()->sole();

        ApiKey::query()->whereKey($pending->api_key_id)->update(['revoked_at' => now()]);

        $outcome = app(AiToolExecutorService::class)->approveAndExecute($pending, $this->owner);

        expect($outcome->status)->toBe('denied')
            ->and($outcome->message)->toContain('can no longer run writes')
            ->and($pending->fresh()->status->value)->toBe('pending')
            ->and($this->blogItem->fresh()->draft_data)->not->toBeNull();
    });

    it('refuses to run an approved MCP call that has no API key on record (#441)', function (): void {
        // A narrowed key, so running the call with the owner's full permissions would publish news.
        $key = mcpParityKey($this->owner, $this->role, ['collection_slugs' => ['blog', 'news']]);
        mcpParityTool($key, 'publish_item', ['item_id' => $this->newsItem->id]);
        $pending = PendingToolCall::query()->sole();

        // What a row parked before `api_key_id` existed (1.4.0), or whose key row was deleted
        // (`nullOnDelete`), looks like.
        $pending->forceFill(['api_key_id' => null])->save();

        $outcome = app(AiToolExecutorService::class)->approveAndExecute($pending, $this->owner);

        expect($outcome->status)->toBe('denied')
            ->and($outcome->message)->toContain('no API key on record')
            ->and($pending->fresh()->status->value)->toBe('pending')
            ->and($this->newsItem->fresh()->draft_data)->not->toBeNull();
    });

    it('still runs an approved in-scope call', function (): void {
        $key = mcpParityKey($this->owner, $this->role);
        mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);
        $pending = PendingToolCall::query()->sole();

        $outcome = app(AiToolExecutorService::class)->approveAndExecute($pending, $this->owner);

        expect($outcome->isOk())->toBeTrue()
            ->and($this->blogItem->fresh()->draft_data)->toBeNull();
    });

    it('rejects out-of-scope publish_item before it reaches approval', function (): void {
        $key = mcpParityKey($this->owner, $this->role);

        $body = mcpParityTool($key, 'publish_item', ['item_id' => $this->newsItem->id]);

        expect(mcpParityFailed($body))->toBeTrue()
            ->and(PendingToolCall::query()->count())->toBe(0)
            ->and($this->newsItem->fresh()->draft_data)->not->toBeNull();
    });

    it('honors the write kill switch and per-tool allowlist', function (array $toolConfig): void {
        config($toolConfig);
        $key = mcpParityKey($this->owner, $this->role);

        $publish = mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);
        $tag = mcpParityTool($key, 'tag_file', ['file_id' => $this->publicFile->id, 'tags_json' => '["hero"]']);

        expect(mcpParityFailed($publish))->toBeTrue()
            ->and(mcpParityFailed($tag))->toBeTrue()
            ->and(PendingToolCall::query()->count())->toBe(0)
            ->and($this->blogItem->fresh()->draft_data)->not->toBeNull()
            ->and($this->publicFile->fresh()->tags)->toHaveCount(0);
    })->with([
        'kill switch off' => [['ai.tools.write_enabled' => false]],
        'tool not allowlisted' => [['ai.tools.write_allow' => ['ManageUsers']]],
    ]);

    it('does not expose or run write tools for a read-only key', function (): void {
        $key = mcpParityKey($this->owner, $this->role, [
            'scopes' => [
                ApiKeyScopeEnum::McpRead->value,
                ApiKeyScopeEnum::CollectionsRead->value,
                ApiKeyScopeEnum::FilesRead->value,
            ],
        ]);

        $toolNames = collect(mcpParityCall($key, 'tools/list', [])['result']['tools'] ?? [])->pluck('name');
        $publish = mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);
        $tag = mcpParityTool($key, 'tag_file', ['file_id' => $this->publicFile->id, 'tags_json' => '["hero"]']);

        expect($toolNames)->toContain('get_item')->not->toContain('publish_item')->not->toContain('tag_file')
            ->and(mcpParityFailed($publish))->toBeTrue()
            ->and(mcpParityFailed($tag))->toBeTrue()
            ->and(PendingToolCall::query()->count())->toBe(0);
    });

    it('publishes the draft once a human approves the pending call', function (): void {
        $key = mcpParityKey($this->owner, $this->role);
        mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);

        $outcome = app(AiToolExecutorService::class)->approveAndExecute(PendingToolCall::query()->sole(), $this->owner);

        expect($outcome->status)->toBe('ok')
            ->and($this->blogItem->fresh()->draft_data)->toBeNull();
    });
});

describe('attribution', function (): void {
    it('records the authorising key on every tool decision, including a human-approved one', function (): void {
        config(['ai.mcp.write_requires_approval' => true]);
        $key = mcpParityKey($this->owner, $this->role);
        $apiKeyId = ApiKey::query()->where('key_hash', ApiKey::hashSecret($key))->value('id');

        mcpParityTool($key, 'get_item', ['item_id' => $this->blogItem->id]);
        mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);
        app(AiToolExecutorService::class)->approveAndExecute(PendingToolCall::query()->sole(), $this->owner);

        $toolDecisions = Activity::query()->where('log_name', 'ai')->where('event', 'ai_tool')->get();

        // The read, the pending write, and its approved run (the executor logs some steps twice).
        expect($toolDecisions->map(fn (Activity $activity): mixed => $activity->properties->get('decision'))->unique()->values()->all())
            ->toContain('pending')
            ->and($toolDecisions->count())->toBeGreaterThanOrEqual(3)
            ->and($toolDecisions->map(fn (Activity $activity): mixed => $activity->properties->get('api_key_id'))->unique()->all())
            ->toBe([$apiKeyId]);
    });

    it('records who approved a call, when, and whether the requester approved it (#441)', function (): void {
        $colleague = User::factory()->create();
        $colleague->syncRoles([$this->role]);
        $key = mcpParityKey($this->owner, $this->role);
        $executor = app(AiToolExecutorService::class);

        mcpParityTool($key, 'publish_item', ['item_id' => $this->blogItem->id]);
        $selfApproved = PendingToolCall::query()->sole();
        $executor->approveAndExecute($selfApproved, $this->owner);

        mcpParityTool($key, 'tag_file', ['file_id' => $this->publicFile->id, 'tags_json' => '["hero"]']);
        $colleagueApproved = PendingToolCall::query()->where('status', 'pending')->sole();
        $executor->approveAndExecute($colleagueApproved, $colleague);

        $executedEntryFor = fn (PendingToolCall $pending): Activity => Activity::query()
            ->where('log_name', 'ai')
            ->where('event', 'ai_tool')
            ->get()
            ->sole(fn (Activity $activity): bool => $activity->properties->get('decision') === 'executed'
                && $activity->properties->get('pending_id') === $pending->uuid);

        $selfEntry = $executedEntryFor($selfApproved);
        $colleagueEntry = $executedEntryFor($colleagueApproved);

        expect($selfEntry->causer_id)->toBe($this->owner->id)
            ->and($selfEntry->properties->get('approver_id'))->toBe($this->owner->id)
            ->and($selfEntry->properties->get('is_self_approval'))->toBeTrue()
            ->and($selfEntry->created_at)->not->toBeNull()
            ->and($colleagueEntry->causer_id)->toBe($this->owner->id)
            ->and($colleagueEntry->properties->get('approver_id'))->toBe($colleague->id)
            ->and($colleagueEntry->properties->get('is_self_approval'))->toBeFalse();
    });
});
