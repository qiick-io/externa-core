<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\Collection;
use App\Models\Role;
use App\Models\User;
use App\Services\Api\ApiKeyAuthenticatorService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Testing\TestResponse;
use Laravel\Passport\Token;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\McpOAuthTestHelpers as OAuth;

/**
 * OAuth for remote MCP clients (#802), end to end as a connector drives it: registration, the
 * authorization request, consent (which narrows), the code exchange, refresh, and MCP calls.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
    OAuth::enableOAuth();

    $this->role = Role::query()->create([
        'name' => 'mcp-oauth-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $this->role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);

    $this->user = User::factory()->create(['is_active' => true]);
    $this->user->syncRoles([$this->role]);
});

describe('the connector flow', function (): void {
    it('lets a connector register, get consent and call MCP without an API key', function (): void {
        $issued = OAuth::issueAccessToken($this, $this->user, [
            'scopes' => ['mcp:read', 'collections:read'],
            'role_id' => $this->role->id,
        ]);

        OAuth::mcpRequest($this, $issued['access_token'], 'tools/list')->assertOk();

        $grant = $issued['grant'];
        $token = Token::query()->where('api_key_id', $grant->id)->sole();

        expect($grant->isOAuthGrant())->toBeTrue()
            ->and($grant->name)->toBe('Claude')
            ->and($grant->owner_id)->toBe($this->user->id)
            ->and($grant->role_id)->toBe($this->role->id)
            ->and($grant->scopes)->toBe(['collections:read', 'mcp:read'])
            ->and($grant->collection_slugs)->toBeNull()
            ->and(ApiKey::publicPrefixOf($grant->key_prefix))->toBeNull()
            ->and($token->getAttribute('audience'))->toBe(OAuth::resource())
            ->and($token->scopes)->toBe(['mcp:use']);
    });

    it('sends a guest to the login page before the consent screen', function (): void {
        $clientId = OAuth::registerClient($this);

        $this->get(OAuth::authorizationUrl($clientId, OAuth::pkcePair()['challenge']))
            ->assertRedirect('/login');
    });

    it('refreshes an access token, rotating the refresh token, and binds the new token to the grant', function (): void {
        $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
        $refresh = fn (): TestResponse => $this->post('/oauth/token', [
            'grant_type' => 'refresh_token',
            'refresh_token' => $issued['refresh_token'],
            'client_id' => $issued['client_id'],
            'resource' => OAuth::resource(),
        ]);

        $refreshed = $refresh()->assertOk()->json();

        OAuth::mcpRequest($this, $refreshed['access_token'])->assertOk();
        $refresh()->assertStatus(400)->assertJsonPath('error', 'invalid_grant');

        expect(Token::query()->where('api_key_id', $issued['grant']->id)->count())->toBe(2);
    });

    it('revokes at once a token minted for a grant revoked before the code was exchanged', function (): void {
        $clientId = OAuth::registerClient($this);
        $pkce = OAuth::pkcePair();
        $consentPage = OAuth::openConsent($this, $this->user, $clientId, $pkce['challenge']);
        $clientRedirect = OAuth::approve($this, $consentPage, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
        ApiKey::query()->where('oauth_client_id', $clientId)->update(['revoked_at' => now()]);

        $accessToken = OAuth::exchangeCode($this, $clientId, OAuth::codeFrom($clientRedirect), $pkce['verifier'])->json('access_token');
        auth()->forgetGuards();

        OAuth::mcpRequest($this, (string) $accessToken)->assertUnauthorized()->assertJsonPath('error', 'invalid_token');
        expect(Token::query()->where('client_id', $clientId)->sole()->revoked)->toBeTrue();
    });
});

describe('the consent screen', function (): void {
    it('shows the client, the host it returns to, every grantable API-key scope and the user\'s own roles', function (): void {
        $clientId = OAuth::registerClient($this, clientName: 'Claude');
        $otherRole = Role::query()->create(['name' => 'not-mine-'.uniqid(), 'guard_name' => 'web', 'is_system' => false, 'is_assignable' => true]);

        $page = OAuth::openConsent($this, $this->user, $clientId, OAuth::pkcePair()['challenge'], 'mcp:use')
            ->assertOk();

        expect($page->inertiaPage()['component'])->toBe('oauth/authorize')
            ->and($page->inertiaProps('client.name'))->toBe('Claude')
            ->and($page->inertiaProps('client.redirectHost'))->toBe('claude.ai')
            ->and(collect($page->inertiaProps('scopes'))->pluck('value')->all())->toBe([
                'collections:read', 'collections:write', 'files:read', 'files:write', 'mcp:read', 'mcp:write',
            ])
            ->and(collect($page->inertiaProps('scopes'))->firstWhere('value', 'mcp:read'))->toMatchArray(['isGrantable' => true])
            ->and(collect($page->inertiaProps('scopes'))->firstWhere('value', 'files:write'))->toMatchArray(['isGrantable' => false])
            ->and(collect($page->inertiaProps('roles'))->pluck('id')->all())->toBe([$this->role->id])
            ->and(collect($page->inertiaProps('roles'))->pluck('id'))->not->toContain($otherRole->id)
            ->and($page->inertiaProps('canGrant'))->toBeTrue();
    });

    it('offers every API-key scope for mcp:use (or nothing) and drops other wire scopes', function (?string $requestedScope): void {
        $clientId = OAuth::registerClient($this);

        $page = OAuth::openConsent($this, $this->user, $clientId, OAuth::pkcePair()['challenge'], $requestedScope)->assertOk();

        expect(collect($page->inertiaProps('scopes'))->pluck('value')->all())->toBe([
            'collections:read', 'collections:write', 'files:read', 'files:write', 'mcp:read', 'mcp:write',
        ]);
    })->with([
        'nothing requested' => [null],
        'mcp:use' => ['mcp:use'],
        'foreign scopes mixed with mcp:use' => ['openid mcp:use offline_access'],
        'API-key scopes on the wire are dropped' => ['mcp:read collections:write'],
    ]);

    it('asks again every time, even for scopes approved before', function (): void {
        $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id], 'mcp:read');

        OAuth::openConsent($this, $this->user, $issued['client_id'], OAuth::pkcePair()['challenge'], 'mcp:read')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('oauth/authorize'));
    });

    it('narrows the grant to what the user approved, not what the client asked for', function (): void {
        $issued = OAuth::issueAccessToken(
            $this,
            $this->user,
            ['scopes' => ['mcp:read', 'collections:read'], 'role_id' => $this->role->id],
            'mcp:write collections:write',
        );

        expect($issued['grant']->scopes)->toBe(['collections:read', 'mcp:read'])
            ->and(Token::query()->where('api_key_id', $issued['grant']->id)->sole()->scopes)->toBe(['mcp:use'])
            ->and(OAuth::mcpToolNames($this, $issued['access_token']))->toContain('list_items')->not->toContain('create_item');
    });

    it('tells the client the wire scope mcp:use in the token response (RFC 6749 §5.1)', function (): void {
        $clientId = OAuth::registerClient($this);
        $pkce = OAuth::pkcePair();
        $consentPage = OAuth::openConsent($this, $this->user, $clientId, $pkce['challenge'], 'mcp:use');
        $clientRedirect = OAuth::approve($this, $consentPage, ['scopes' => ['mcp:read', 'collections:read'], 'role_id' => $this->role->id]);

        OAuth::exchangeCode($this, $clientId, OAuth::codeFrom($clientRedirect), $pkce['verifier'])
            ->assertOk()
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('scope', 'mcp:use')
            ->assertJsonPath('expires_in', 3600);
    });

    it('narrows the grant to the collections the user ticked', function (): void {
        $blog = Collection::factory()->create(['slug' => 'blog']);
        Collection::factory()->create(['slug' => 'news']);

        $issued = OAuth::issueAccessToken($this, $this->user, [
            'scopes' => ['mcp:read', 'collections:read'],
            'role_id' => $this->role->id,
            'collection_slugs' => [$blog->slug],
        ]);

        expect($issued['grant']->collection_slugs)->toBe(['blog']);
    });

    it('refuses an approval the user may not grant', function (array $choices, string $invalidField): void {
        $clientId = OAuth::registerClient($this);
        $consentPage = OAuth::openConsent($this, $this->user, $clientId, OAuth::pkcePair()['challenge'], 'mcp:use');

        $choices = array_map(fn (mixed $choice): mixed => $choice instanceof Closure ? $choice($this) : $choice, $choices);

        OAuth::approve($this, $consentPage, $choices)->assertSessionHasErrors($invalidField);
        expect(ApiKey::query()->whereNotNull('oauth_client_id')->count())->toBe(0);
    })->with([
        'a scope the user does not hold' => [['scopes' => ['mcp:read', 'files:read'], 'role_id' => fn ($test) => $test->role->id], 'scopes.1'],
        'no mcp scope' => [['scopes' => ['collections:read'], 'role_id' => fn ($test) => $test->role->id], 'scopes'],
        'a role the user does not hold' => [['scopes' => ['mcp:read'], 'role_id' => fn ($test) => Role::query()->where('name', RoleEnum::Admin->value)->value('id')], 'role_id'],
        'the super-admin role' => [['scopes' => ['mcp:read'], 'role_id' => fn ($test) => Role::query()->where('name', RoleEnum::SuperAdmin->value)->value('id')], 'role_id'],
        'a collection the user cannot read' => [['scopes' => ['mcp:read'], 'role_id' => fn ($test) => $test->role->id, 'collection_slugs' => ['does-not-exist']], 'collection_slugs.0'],
    ]);

    it('checks the act of approving, not only the page: a user who may not use AI cannot approve', function (): void {
        $this->role->revokePermissionTo(PermissionEnum::CanUseAi->value);
        $clientId = OAuth::registerClient($this);

        $consentPage = OAuth::openConsent($this, $this->user, $clientId, OAuth::pkcePair()['challenge'], 'mcp:read')->assertOk();

        expect($consentPage->inertiaProps('canGrant'))->toBeFalse();
        OAuth::approve($this, $consentPage, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id])->assertForbidden();
        expect(ApiKey::query()->whereNotNull('oauth_client_id')->count())->toBe(0);
    });

    it('refuses an approval without a pending authorization request', function (): void {
        $this->actingAs($this->user)
            ->post('/oauth/authorize', [
                'auth_token' => 'forged',
                'scopes' => ['mcp:read'],
                'role_id' => $this->role->id,
                'all_collections' => true,
            ])
            ->assertForbidden();
    });

    it('refuses an approval that ticks no collection and does not allow every collection', function (): void {
        Collection::factory()->create(['slug' => 'blog']);
        $clientId = OAuth::registerClient($this);
        $consentPage = OAuth::openConsent($this, $this->user, $clientId, OAuth::pkcePair()['challenge'], 'mcp:use');

        OAuth::approve($this, $consentPage, [
            'scopes' => ['mcp:read'],
            'role_id' => $this->role->id,
            'all_collections' => false,
            'collection_slugs' => [],
        ])->assertSessionHasErrors('collection_slugs');
    });

    it('sends access_denied back to the client when the user denies, and records nothing', function (): void {
        $clientId = OAuth::registerClient($this);
        $consentPage = OAuth::openConsent($this, $this->user, $clientId, OAuth::pkcePair()['challenge'], 'mcp:read');

        $response = $this->delete('/oauth/authorize', ['auth_token' => $consentPage->inertiaProps('authToken')]);

        $location = (string) $response->assertRedirect()->headers->get('Location');
        expect($location)->toStartWith(OAuth::REDIRECT_URI.'?')
            ->and($location)->toContain('error=access_denied')
            ->and($location)->toContain('state=state-value')
            ->and(ApiKey::query()->whereNotNull('oauth_client_id')->count())->toBe(0);
    });

    it('leaves the Inertia visit with a full-page redirect to the client', function (): void {
        $clientId = OAuth::registerClient($this);
        $consentPage = OAuth::openConsent($this, $this->user, $clientId, OAuth::pkcePair()['challenge'], 'mcp:read');

        $response = $this->post('/oauth/authorize', [
            'auth_token' => $consentPage->inertiaProps('authToken'),
            'scopes' => ['mcp:read'],
            'role_id' => $this->role->id,
            'all_collections' => true,
        ], ['X-Inertia' => 'true']);

        $response->assertStatus(409);
        expect((string) $response->headers->get('X-Inertia-Location'))->toStartWith(OAuth::REDIRECT_URI.'?code=');
    });

    it('replaces an earlier grant on a new consent and revokes what the client held before', function (): void {
        $first = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read', 'collections:read'], 'role_id' => $this->role->id]);
        $pkce = OAuth::pkcePair();
        $consentPage = OAuth::openConsent($this, $this->user, $first['client_id'], $pkce['challenge'], 'mcp:read');
        $clientRedirect = OAuth::approve($this, $consentPage, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
        $second = OAuth::exchangeCode($this, $first['client_id'], OAuth::codeFrom($clientRedirect), $pkce['verifier'])->json('access_token');
        auth()->forgetGuards();

        OAuth::mcpRequest($this, $first['access_token'])->assertUnauthorized()->assertJsonPath('message', 'The access token has been revoked.');
        OAuth::mcpRequest($this, (string) $second)->assertOk();

        expect(ApiKey::query()->where('oauth_client_id', $first['client_id'])->count())->toBe(2)
            ->and($first['grant']->fresh()->isRevoked())->toBeTrue()
            ->and(ApiKey::query()->where('oauth_client_id', $first['client_id'])->whereNull('revoked_at')->sole()->scopes)->toBe(['mcp:read']);
    });
});

describe('the authorization and token endpoints', function (): void {
    it('requires PKCE with S256', function (array $overrides, string $error): void {
        $clientId = OAuth::registerClient($this);

        $this->actingAs($this->user)
            // A well-formed challenge, so only this server's own rule can refuse `plain`.
            ->get(OAuth::authorizationUrl($clientId, OAuth::pkcePair()['verifier'], 'mcp:read', $overrides))
            ->assertStatus(400)
            ->assertJsonPath('error', $error);
    })->with([
        'no code challenge' => [['code_challenge' => '', 'code_challenge_method' => ''], 'invalid_request'],
        'plain' => [['code_challenge_method' => 'plain'], 'invalid_request'],
    ]);

    it('refuses an authorization request for another resource (RFC 8707)', function (): void {
        $clientId = OAuth::registerClient($this);

        $this->actingAs($this->user)
            ->get(OAuth::authorizationUrl($clientId, OAuth::pkcePair()['challenge'], 'mcp:read', ['resource' => 'https://other.example/mcp']))
            ->assertStatus(400)
            ->assertJsonPath('error', 'invalid_target');
    });

    it('refuses an authorization request that names no resource (RFC 8707)', function (): void {
        $clientId = OAuth::registerClient($this);
        $pkce = OAuth::pkcePair();
        $url = OAuth::authorizationUrl($clientId, $pkce['challenge'], 'mcp:read');

        $this->actingAs($this->user)
            ->get(preg_replace('/&resource=[^&]*/', '', $url))
            ->assertStatus(400)
            ->assertJsonPath('error', 'invalid_target');
    });

    it('refuses a token request for another resource (RFC 8707)', function (): void {
        $clientId = OAuth::registerClient($this);
        $pkce = OAuth::pkcePair();
        $consentPage = OAuth::openConsent($this, $this->user, $clientId, $pkce['challenge'], 'mcp:read');
        $clientRedirect = OAuth::approve($this, $consentPage, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);

        OAuth::exchangeCode($this, $clientId, OAuth::codeFrom($clientRedirect), $pkce['verifier'], ['resource' => 'https://other.example/mcp'])
            ->assertStatus(400)
            ->assertJsonPath('error', 'invalid_target');

        expect(Token::query()->count())->toBe(0);
    });

    it('refuses a code exchange without the PKCE verifier', function (): void {
        $clientId = OAuth::registerClient($this);
        $pkce = OAuth::pkcePair();
        $consentPage = OAuth::openConsent($this, $this->user, $clientId, $pkce['challenge'], 'mcp:read');
        $clientRedirect = OAuth::approve($this, $consentPage, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);

        OAuth::exchangeCode($this, $clientId, OAuth::codeFrom($clientRedirect), 'wrong-verifier-'.str_repeat('x', 40))
            ->assertStatus(400)
            ->assertJsonPath('error', 'invalid_grant');
    });

    it('accepts only the authorization code and refresh token grants', function (string $grantType): void {
        $clientId = OAuth::registerClient($this);

        $this->post('/oauth/token', ['grant_type' => $grantType, 'client_id' => $clientId, 'scope' => 'mcp:read'])
            ->assertStatus(400)
            ->assertJsonPath('error', 'unsupported_grant_type');
    })->with(['client_credentials', 'password', 'urn:ietf:params:oauth:grant-type:device_code', 'personal_access']);
});

describe('the audit trail', function (): void {
    it('records the authorization in the api-keys log, naming the client', function (): void {
        $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);

        $entry = Activity::query()->where('log_name', 'api-keys')->where('event', 'oauth_authorized')->sole();

        expect($entry->causer_id)->toBe($this->user->id)
            ->and($entry->subject_id)->toBe($issued['grant']->id)
            ->and($entry->properties->get('name'))->toBe('Claude')
            ->and($entry->properties->get('oauth_client_id'))->toBe($issued['client_id'])
            ->and($entry->properties->get('redirect_host'))->toBe('claude.ai')
            ->and($entry->properties->get('scopes'))->toBe(['mcp:read'])
            ->and($entry->properties->get('role_id'))->toBe($this->role->id);
    });

    it('names the client on every MCP tool entry made with its token', function (): void {
        Collection::factory()->create(['slug' => 'posts']);
        $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read', 'collections:read'], 'role_id' => $this->role->id]);

        OAuth::mcpTool($this, $issued['access_token'], 'list_collections');

        $toolEntries = Activity::query()->where('log_name', 'ai')->where('event', 'ai_tool')->get();

        expect($toolEntries)->not->toBeEmpty()
            ->and($toolEntries->map(fn (Activity $entry): mixed => $entry->properties->get('api_key_id'))->unique()->all())->toBe([$issued['grant']->id])
            ->and($toolEntries->map(fn (Activity $entry): mixed => $entry->properties->get('oauth_client_id'))->unique()->all())->toBe([$issued['client_id']])
            ->and($toolEntries->map(fn (Activity $entry): mixed => $entry->properties->get('oauth_client_name'))->unique()->all())->toBe(['Claude']);
    });

    it('keeps the 1.5.0 shape of tool entries made with an API key', function (): void {
        Collection::factory()->create(['slug' => 'posts']);
        $apiKey = OAuth::issueApiKey($this->user, $this->role, ['mcp:read', 'collections:read']);

        OAuth::mcpTool($this, $apiKey, 'list_collections');

        $toolEntries = Activity::query()->where('log_name', 'ai')->where('event', 'ai_tool')->get();

        expect($toolEntries)->not->toBeEmpty()
            ->and($toolEntries->every(fn (Activity $entry): bool => ! $entry->properties->has('oauth_client_id')))->toBeTrue();
    });
});

describe('API keys and grants stay apart', function (): void {
    it('never lists, rotates or revokes a grant as an API key', function (): void {
        $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
        $admin = User::factory()->create(['is_active' => true]);
        $admin->assignRole(RoleEnum::SuperAdmin->value);

        $this->actingAs($admin)->get('/settings/api-keys')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('apiKeys.data', []));
        $this->actingAs($admin)->post('/settings/api-keys/'.$issued['grant']->id.'/rotate')->assertForbidden();
        $this->actingAs($admin)->delete('/settings/api-keys/'.$issued['grant']->id)->assertForbidden();

        expect($issued['grant']->fresh()->isRevoked())->toBeFalse();
    });

    it('never authenticates a grant row as a bearer API key', function (): void {
        $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);

        OAuth::mcpRequest($this, $issued['grant']->key_prefix.str_repeat('x', 32))
            ->assertUnauthorized()
            ->assertJsonPath('error', 'invalid_token');
    });
});

it('skips grant rows when it looks up a presented API key, even a token-shaped one', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    // What it would take for a grant row to answer as an API key: a key-shaped prefix and the
    // hash of a known secret. Lookup must still skip it.
    $secret = ApiKey::generateSecret();
    $issued['grant']->forceFill(['key_prefix' => $secret['prefix'], 'key_hash' => $secret['hash']])->save();

    expect(app(ApiKeyAuthenticatorService::class)->findByToken($secret['plain']))->toBeNull();
    OAuth::mcpRequest($this, $secret['plain'])->assertUnauthorized()->assertJsonPath('message', 'The API key is not valid.');
});
