<?php

declare(strict_types=1);

use App\Actions\ApiKeys\RevokeApiKeyAction;
use App\Actions\ApiKeys\RotateApiKeyAction;
use App\Enums\ApiKeyScopeEnum;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FilePermissionActionEnum;
use App\Enums\PermissionEnum;
use App\Models\ApiKey;
use App\Models\CollectionItem;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

/**
 * How a presented API key is accepted or refused (#781): the token format, the RFC 6750 answers
 * shared by every surface, the rotation grace window, immediate revocation, fail-closed scopes,
 * the rate limit and usage recording.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    config(['ai.mcp.enabled' => true, 'ai.tools.enabled' => true]);

    $this->posts = makePostsCollection();
    $this->item = CollectionItem::factory()->create(['collection_id' => $this->posts->id]);
    $this->auth = makeApiKeyForRole();
    grantRoleActions($this->auth['role'], $this->posts, [
        CollectionPermissionActionEnum::Read,
        CollectionPermissionActionEnum::Create,
    ]);
});

/**
 * Owned key with MCP access on a role holding no grants. The owner holds the permissions
 * needed to grant the given scopes (use-time re-check), without holding the key's acting role.
 *
 * @return array{plain: string, key: ApiKey}
 */
function makeAuthenticationMcpKey(array $scopes): array
{
    $ownerRole = Role::query()->create([
        'name' => 'mcp-auth-owner-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $ownerRole->syncPermissions([
        PermissionEnum::CanUseAi->value,
        PermissionEnum::CanShowCollections->value,
        PermissionEnum::CanEditCollections->value,
        PermissionEnum::CanShowFiles->value,
        PermissionEnum::CanEditFiles->value,
    ]);

    $owner = User::factory()->create(['is_active' => true]);
    $owner->syncRoles([$ownerRole]);

    $secret = ApiKey::generateSecret();
    $key = ApiKey::factory()->withSecret($secret)->create([
        'role_id' => Role::factory()->create()->id,
        'owner_id' => $owner->id,
        'scopes' => $scopes,
    ]);

    return ['plain' => $secret['plain'], 'key' => $key];
}

/**
 * Minimal MCP JSON-RPC `server/discover` (the 2026-07-28 handshake; `ping` is legacy-only since
 * laravel/mcp 1.2.1) with the headers the server requires.
 */
function discoverMcpWithToken(string $token): TestResponse
{
    return test()->withToken($token)->postJson('/mcp', [
        'jsonrpc' => '2.0',
        'id' => 1,
        'method' => 'server/discover',
        'params' => [
            '_meta' => [
                'io.modelcontextprotocol/protocolVersion' => '2026-07-28',
                'io.modelcontextprotocol/clientCapabilities' => new stdClass,
                'io.modelcontextprotocol/clientInfo' => ['name' => 'externa-pest', 'version' => '1.0.0'],
            ],
        ],
    ], [
        'Accept' => 'application/json, text/event-stream',
        'MCP-Protocol-Version' => '2026-07-28',
        'Mcp-Method' => 'server/discover',
    ]);
}

describe('token format', function (): void {
    it('issues ext_<env>_<id><secret> tokens and stores only the public part and the full-token hash', function (): void {
        $secret = ApiKey::generateSecret();

        expect($secret['plain'])->toMatch(ApiKey::TOKEN_PATTERN)
            ->and($secret['plain'])->toStartWith('ext_test_')
            ->and(strlen($secret['plain']))->toBe(strlen('ext_test_') + 8 + 32)
            ->and($secret['prefix'])->toBe(substr($secret['plain'], 0, strlen('ext_test_') + 8))
            ->and($secret['hash'])->toBe(hash('sha256', $secret['plain']));
    });

    it('marks tokens issued in production as live', function (): void {
        app()->detectEnvironment(fn (): string => 'production');

        expect(ApiKey::generateSecret()['plain'])->toStartWith('ext_live_');
    });

    it('keeps accepting keys issued before 1.5.0 in the ek_ shape', function (): void {
        $legacyToken = 'ek_'.Str::random(40);
        $legacyKey = ApiKey::factory()->for($this->auth['role'])->create([
            'key_prefix' => substr($legacyToken, 0, 12),
            'key_hash' => hash('sha256', $legacyToken),
        ]);

        $this->withToken($legacyToken)->getJson('/api/v1/collections')->assertOk();

        expect($legacyKey->fresh()->last_used_at)->not->toBeNull();
    });

    it('does not accept a token with a trailing newline at the format check', function (): void {
        expect(ApiKey::publicPrefixOf($this->auth['plain']))->not->toBeNull()
            ->and(ApiKey::publicPrefixOf($this->auth['plain']."\n"))->toBeNull()
            ->and(ApiKey::publicPrefixOf('ek_'.Str::random(40)."\n"))->toBeNull()
            ->and('collections:read'."\n")->not->toMatch(ApiKeyScopeEnum::PATTERN);
    });

    it('refuses a token whose environment marker was edited, since the hash covers the full token', function (): void {
        $editedToken = preg_replace('/^ext_test_/', 'ext_live_', $this->auth['plain']);

        $this->withToken((string) $editedToken)->getJson('/api/v1/collections')
            ->assertUnauthorized()
            ->assertJsonPath('error', 'invalid_token');
    });
});

describe('invalid_token', function (): void {
    it('refuses unknown, expired and revoked keys with the same 401 shape on REST', function (string $state, string $message): void {
        $token = match ($state) {
            'unknown' => ApiKey::generateSecret()['plain'],
            'malformed' => 'not-an-api-key',
            default => $this->auth['plain'],
        };

        match ($state) {
            'expired' => $this->auth['key']->forceFill(['expires_at' => now()->subMinute()])->save(),
            'revoked' => $this->auth['key']->forceFill(['revoked_at' => now()->subMinute()])->save(),
            default => null,
        };

        $this->withToken($token)->getJson('/api/v1/collections')
            ->assertUnauthorized()
            ->assertHeader('WWW-Authenticate', 'Bearer error="invalid_token"')
            ->assertExactJson(['message' => $message, 'error' => 'invalid_token']);
    })->with([
        'unknown' => ['unknown', 'The API key is not valid.'],
        'malformed' => ['malformed', 'The API key is not valid.'],
        'expired' => ['expired', 'The API key has expired.'],
        'revoked' => ['revoked', 'The API key has been revoked.'],
    ]);

    it('refuses a key whose owner was deactivated', function (): void {
        $owner = User::factory()->create(['is_active' => false]);
        $this->auth['key']->forceFill(['owner_id' => $owner->id])->save();

        $this->withToken($this->auth['plain'])->getJson('/api/v1/collections')
            ->assertUnauthorized()
            ->assertJsonPath('error', 'invalid_token');
    });

    it('refuses revoked and expired keys with the same shape on MCP', function (string $state): void {
        $mcpKey = makeAuthenticationMcpKey([ApiKeyScopeEnum::McpRead->value]);
        $mcpKey['key']->forceFill([$state === 'expired' ? 'expires_at' : 'revoked_at' => now()->subMinute()])->save();

        // laravel/mcp adds its realm to the challenge; the error code is the shared one.
        discoverMcpWithToken($mcpKey['plain'])
            ->assertUnauthorized()
            ->assertHeader('WWW-Authenticate', 'Bearer realm="mcp", error="invalid_token"')
            ->assertJsonPath('error', 'invalid_token');
    })->with(['expired', 'revoked']);

    it('refuses a key on the very next request after it is revoked', function (): void {
        $this->withToken($this->auth['plain'])->getJson('/api/v1/collections')->assertOk();

        app(RevokeApiKeyAction::class)->execute($this->auth['key'], User::factory()->create());

        $this->withToken($this->auth['plain'])->getJson('/api/v1/collections')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'The API key has been revoked.');
    });
});

describe('insufficient_scope', function (): void {
    it('names the missing scope when a read key writes', function (): void {
        $this->auth['key']->forceFill(['scopes' => [ApiKeyScopeEnum::CollectionsRead->value]])->save();

        $this->withToken($this->auth['plain'])->postJson('/api/v1/collections/posts/items', ['data' => []])
            ->assertForbidden()
            ->assertHeader('WWW-Authenticate', 'Bearer error="insufficient_scope", scope="collections:write"')
            ->assertExactJson([
                'message' => 'The API key lacks the collections:write scope.',
                'error' => 'insufficient_scope',
                'scope' => 'collections:write',
            ]);
    });

    it('lets write stand in for read on the same resource only', function (): void {
        grantFileActions($this->auth['role'], [FilePermissionActionEnum::Read]);
        $this->auth['key']->forceFill(['scopes' => [ApiKeyScopeEnum::CollectionsWrite->value]])->save();

        $this->withToken($this->auth['plain'])->getJson("/api/v1/collections/posts/items/{$this->item->id}")->assertOk();
        $this->withToken($this->auth['plain'])->getJson('/api/v1/files')
            ->assertForbidden()
            ->assertJsonPath('scope', 'files:read');
    });

    it('refuses every request from a key whose scopes are empty or no longer parse', function (mixed $storedScopes): void {
        $this->auth['key']->forceFill(['scopes' => $storedScopes])->save();
        $mcpKey = makeAuthenticationMcpKey([ApiKeyScopeEnum::McpWrite->value]);
        $mcpKey['key']->forceFill(['scopes' => $storedScopes])->save();

        $this->withToken($this->auth['plain'])->getJson('/api/v1/collections')
            ->assertForbidden()
            ->assertJsonPath('error', 'insufficient_scope')
            ->assertJsonPath('message', 'The API key holds no scopes.');
        discoverMcpWithToken($mcpKey['plain'])
            ->assertForbidden()
            ->assertJsonPath('error', 'insufficient_scope');
    })->with([
        'empty list' => [[]],
        'null' => [null],
        'one unknown entry poisons the list' => [['collections:write', 'collections:admin']],
        'not a list' => [['collections' => 'write']],
    ]);

    it('refuses MCP to a key without an mcp scope', function (): void {
        $mcpKey = makeAuthenticationMcpKey([ApiKeyScopeEnum::CollectionsWrite->value]);

        discoverMcpWithToken($mcpKey['plain'])
            ->assertForbidden()
            ->assertJsonPath('error', 'insufficient_scope')
            ->assertJsonPath('scope', 'mcp:read');
    });

    it('lets mcp:write stand in for mcp:read', function (): void {
        $mcpKey = makeAuthenticationMcpKey([ApiKeyScopeEnum::McpWrite->value]);

        discoverMcpWithToken($mcpKey['plain'])->assertOk();
    });
});

describe('rotation', function (): void {
    it('keeps the previous secret working inside the grace window only', function (): void {
        $originalToken = $this->auth['plain'];
        $issuedApiKey = app(RotateApiKeyAction::class)->execute($this->auth['key'], User::factory()->create());

        $this->withToken($issuedApiKey->plainTextKey)->getJson('/api/v1/collections')->assertOk();
        $this->withToken($originalToken)->getJson('/api/v1/collections')->assertOk();

        $this->travel(24)->hours();
        $this->travel(1)->second();

        $this->withToken($originalToken)->getJson('/api/v1/collections')
            ->assertUnauthorized()
            ->assertJsonPath('error', 'invalid_token');
        $this->withToken($issuedApiKey->plainTextKey)->getJson('/api/v1/collections')->assertOk();
    });

    it('keeps the key id, prefix and scopes, and never stores the new secret', function (): void {
        $keyBefore = $this->auth['key']->fresh();
        $issuedApiKey = app(RotateApiKeyAction::class)->execute($keyBefore, User::factory()->create());
        $keyAfter = $keyBefore->fresh();

        expect($keyAfter->id)->toBe($keyBefore->id)
            ->and($keyAfter->uuid)->toBe($keyBefore->uuid)
            ->and($keyAfter->key_prefix)->toBe($keyBefore->key_prefix)
            ->and($keyAfter->scopes)->toBe($keyBefore->scopes)
            ->and($keyAfter->previous_key_hash)->toBe($keyBefore->key_hash)
            ->and($keyAfter->key_hash)->toBe(hash('sha256', $issuedApiKey->plainTextKey))
            ->and($issuedApiKey->plainTextKey)->toStartWith($keyBefore->key_prefix)
            ->and(json_encode($keyAfter->getAttributes()))->not->toContain($issuedApiKey->plainTextKey);
    });

    it('rotates a key issued before 1.5.0 within its ek_ shape', function (): void {
        $legacyToken = 'ek_'.Str::random(40);
        $legacyKey = ApiKey::factory()->for($this->auth['role'])->create([
            'key_prefix' => substr($legacyToken, 0, 12),
            'key_hash' => hash('sha256', $legacyToken),
        ]);

        $issuedApiKey = app(RotateApiKeyAction::class)->execute($legacyKey, User::factory()->create());

        expect($issuedApiKey->plainTextKey)->toMatch(ApiKey::LEGACY_TOKEN_PATTERN)
            ->and($issuedApiKey->plainTextKey)->not->toBe($legacyToken);
        $this->withToken($issuedApiKey->plainTextKey)->getJson('/api/v1/collections')->assertOk();
        $this->withToken($legacyToken)->getJson('/api/v1/collections')->assertOk();
    });

    it('ends the grace window when the key is revoked', function (): void {
        $originalToken = $this->auth['plain'];
        $actor = User::factory()->create();
        $issuedApiKey = app(RotateApiKeyAction::class)->execute($this->auth['key'], $actor);

        app(RevokeApiKeyAction::class)->execute($this->auth['key']->fresh(), $actor);

        $this->withToken($originalToken)->getJson('/api/v1/collections')->assertUnauthorized();
        $this->withToken($issuedApiKey->plainTextKey)->getJson('/api/v1/collections')->assertUnauthorized();
        expect($this->auth['key']->fresh()->previous_key_hash)->toBeNull();
    });
});

describe('limits and usage', function (): void {
    it('applies the key rate limit', function (): void {
        $this->auth['key']->forceFill(['rate_limit_per_minute' => 1])->save();

        $this->withToken($this->auth['plain'])->getJson('/api/v1/collections')->assertOk();
        $this->withToken($this->auth['plain'])->getJson('/api/v1/collections')->assertTooManyRequests();
    });

    it('refuses an address outside the allowlist with 403', function (): void {
        $this->auth['key']->forceFill(['ip_allowlist' => ['203.0.113.10']])->save();

        $this->withToken($this->auth['plain'])->getJson('/api/v1/collections')
            ->assertForbidden()
            ->assertExactJson(['message' => 'API key is not allowed from this IP address.', 'error' => 'ip_not_allowed']);
    });

    it('records the last use at most once a minute, but a new address straight away', function (): void {
        $this->freezeSecond();
        $this->withToken($this->auth['plain'])->getJson('/api/v1/collections')->assertOk();
        $firstUseAt = $this->auth['key']->fresh()->last_used_at;

        $this->travel(30)->seconds();
        $this->withToken($this->auth['plain'])->getJson('/api/v1/collections')->assertOk();
        expect($this->auth['key']->fresh()->last_used_at->equalTo($firstUseAt))->toBeTrue();

        $this->withToken($this->auth['plain'])
            ->withServerVariables(['REMOTE_ADDR' => '198.51.100.7'])
            ->getJson('/api/v1/collections')->assertOk();
        expect($this->auth['key']->fresh()->last_used_ip)->toBe('198.51.100.7')
            ->and($this->auth['key']->fresh()->last_used_at->greaterThan($firstUseAt))->toBeTrue();
    });

    it('does not record a use the key was refused for', function (): void {
        $this->auth['key']->forceFill(['scopes' => [ApiKeyScopeEnum::CollectionsRead->value]])->save();
        $mcpKey = makeAuthenticationMcpKey([ApiKeyScopeEnum::CollectionsRead->value]);

        discoverMcpWithToken($mcpKey['plain'])->assertForbidden();

        expect($mcpKey['key']->fresh()->last_used_at)->toBeNull();
    });
});

describe('sessions', function (): void {
    it('never starts a session for an API key request', function (string $surface): void {
        $mcpKey = makeAuthenticationMcpKey([ApiKeyScopeEnum::McpRead->value]);

        $response = $surface === 'mcp'
            ? discoverMcpWithToken($mcpKey['plain'])
            : $this->withToken($this->auth['plain'])->getJson('/api/v1/collections');

        $response->assertOk()->assertCookieMissing((string) config('session.cookie'));
    })->with(['rest', 'mcp']);

    it('does not sign a bearer token in to the web screens', function (): void {
        $this->withToken($this->auth['plain'])->get(route('api-keys.index'))->assertRedirect(route('login'));
    });
});
