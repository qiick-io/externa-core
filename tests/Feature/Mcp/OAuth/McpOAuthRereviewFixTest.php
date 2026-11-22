<?php

declare(strict_types=1);

use App\Enums\ApiKeyScopeEnum;
use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\ApiKey;
use App\Models\OAuthBlockedRedirectHost;
use App\Models\Role;
use App\Models\User;
use App\Providers\McpOAuthServiceProvider;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Mcp\McpOAuthRedirectUriService;
use App\Services\Mcp\McpOAuthRefreshTokenRepositoryService;
use App\Services\Mcp\McpOAuthServerService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Http\Request;
use Laravel\Passport\Client;
use Laravel\Passport\Passport;
use Laravel\Passport\RefreshToken;
use Laravel\Passport\Token;
use Tests\Support\McpOAuthTestHelpers as OAuth;

/**
 * Independent re-review blockers on #815/#816: each case reproduces the probe that failed,
 * then asserts the fix.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->withoutVite();
    OAuth::enableOAuth();
});

it('lets an instance super-admin grant a non-super-admin role and call /mcp with that grant', function (): void {
    $adminRole = Role::query()->where('name', RoleEnum::Admin->value)->sole();
    $superAdmin = User::factory()->create(['is_active' => true, 'email_verified_at' => now()]);
    $superAdmin->syncRoles([RoleEnum::SuperAdmin->value]);

    $issued = OAuth::issueAccessToken($this, $superAdmin, [
        'scopes' => ['mcp:read'],
        'role_id' => $adminRole->id,
    ]);

    expect($issued['grant']->role_id)->toBe($adminRole->id)
        ->and(in_array($adminRole->id, app(EffectivePermissionResolverService::class)->effectiveRoleIds($superAdmin), true))->toBeFalse();

    OAuth::mcpRequest($this, $issued['access_token'])->assertOk();
});

it('keeps a plain mcp:read API key working when the owner cannot grant that scope', function (): void {
    $owner = User::factory()->create(['is_active' => true]);
    $role = Role::query()->create([
        'name' => 'mcp-key-no-ai-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $secret = ApiKey::generateSecret();
    ApiKey::query()->create([
        'name' => 'Legacy key',
        'key_prefix' => $secret['prefix'],
        'key_hash' => $secret['hash'],
        'role_id' => $role->id,
        'owner_id' => $owner->id,
        'created_by' => $owner->id,
        'scopes' => ['mcp:read'],
    ]);

    expect(app(EffectivePermissionResolverService::class)
        ->canGrantScope($owner, ApiKeyScopeEnum::McpRead))->toBeFalse();

    OAuth::mcpRequest($this, $secret['plain'])->assertOk();
});

it('refuses non-ASCII redirect hosts at registration (clients must use punycode)', function (string $redirectUri): void {
    OAuthBlockedRedirectHost::query()->create(['host' => 'evil.com']);

    $this->postJson('/oauth/register', [
        'client_name' => 'IDN bypass probe',
        'redirect_uris' => [$redirectUri],
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_redirect_uri');

    expect(Client::query()->count())->toBe(0);
})->with([
    'fullwidth letters' => ['https://ｅｖｉｌ.com/cb'],
    'combining accent' => ['https://évil.com/cb'],
    'uppercase É' => ['https://Évil.com/cb'],
    'subdomain of fullwidth' => ['https://sub.ｅｖｉｌ.com/cb'],
]);

it('refuses the NFC punycode form when that ASCII host is blocked', function (): void {
    OAuthBlockedRedirectHost::query()->create(['host' => 'xn--vil-9la.com']);

    $this->postJson('/oauth/register', [
        'client_name' => 'NFC punycode',
        'redirect_uris' => ['https://xn--vil-9la.com/cb'],
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_redirect_uri');
});

it('stores a blocked Unicode host as ASCII and matches the punycode form', function (): void {
    $adminRole = Role::query()->create([
        'name' => 'mcp-idn-admin-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $adminRole->syncPermissions([PermissionEnum::CanManageApiKeys->value]);
    $admin = User::factory()->create(['is_active' => true, 'email_verified_at' => now()]);
    $admin->syncRoles([$adminRole]);

    $this->actingAs($admin)
        ->post('/settings/mcp-oauth-clients/blocked-hosts', ['host' => 'évil.com'])
        ->assertRedirect();

    expect(OAuthBlockedRedirectHost::query()->where('host', 'xn--vil-9la.com')->exists())->toBeTrue()
        ->and(OAuthBlockedRedirectHost::query()->where('host', 'évil.com')->exists())->toBeFalse()
        ->and(app(McpOAuthRedirectUriService::class)->normalizeHost('évil.com'))->toBe('xn--vil-9la.com');

    $this->postJson('/oauth/register', [
        'client_name' => 'Punycode form',
        'redirect_uris' => ['https://xn--vil-9la.com/cb'],
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_redirect_uri');
});

it('registers an IPv6 loopback client and completes the OAuth flow end to end', function (): void {
    $redirectUri = 'http://[::1]:3000/cb';
    $role = Role::query()->create([
        'name' => 'mcp-ipv6-loopback-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);
    $user = User::factory()->create(['is_active' => true, 'email_verified_at' => now()]);
    $user->syncRoles([$role]);

    $clientId = OAuth::registerClient($this, $redirectUri);
    $pkce = OAuth::pkcePair();
    $consentPage = OAuth::openConsent($this, $user, $clientId, $pkce['challenge'], 'mcp:use', [
        'redirect_uri' => $redirectUri,
    ])->assertOk();
    $clientRedirect = OAuth::approve($this, $consentPage, [
        'scopes' => ['mcp:read'],
        'role_id' => $role->id,
    ])->assertRedirect();

    expect((string) $clientRedirect->headers->get('Location'))->toStartWith($redirectUri.'?');

    $accessToken = (string) OAuth::exchangeCode($this, $clientId, OAuth::codeFrom($clientRedirect), $pkce['verifier'], [
        'redirect_uri' => $redirectUri,
    ])->assertOk()->json('access_token');
    auth()->forgetGuards();

    expect(app(McpOAuthRedirectUriService::class)->normalizeHost('[::1]'))->toBe('::1')
        ->and(app(McpOAuthRedirectUriService::class)->clientHasBlockedRedirectHost(
            Client::query()->findOrFail($clientId),
        ))->toBeFalse();

    OAuth::mcpRequest($this, $accessToken)->assertOk();
});

it('applies the blocked-host check when the client id arrives only via HTTP Basic', function (): void {
    $clientId = OAuth::registerClient($this);
    $client = Client::query()->findOrFail($clientId);
    $client->forceFill(['redirect_uris' => ['https://ｅｖｉｌ.com/cb']])->save();

    $this->post('/oauth/token', [
        'grant_type' => 'refresh_token',
        'refresh_token' => 'not-a-token',
        'resource' => OAuth::resource(),
    ], [
        'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($clientId.':'),
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_client');
});

it('refuses authorize and token when an existing client has a non-ASCII redirect host', function (): void {
    $role = Role::query()->create([
        'name' => 'mcp-nonascii-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);
    $user = User::factory()->create(['is_active' => true, 'email_verified_at' => now()]);
    $user->syncRoles([$role]);

    $clientId = OAuth::registerClient($this);
    $client = Client::query()->findOrFail($clientId);
    $client->forceFill(['redirect_uris' => ['https://ｅｖｉｌ.com/cb']])->save();

    $pkce = OAuth::pkcePair();

    $this->actingAs($user)
        ->get(OAuth::authorizationUrl($clientId, $pkce['challenge'], 'mcp:use', [
            'redirect_uri' => 'https://ｅｖｉｌ.com/cb',
        ]))
        ->assertStatus(400);

    $this->post('/oauth/token', [
        'grant_type' => 'refresh_token',
        'refresh_token' => 'not-a-token',
        'client_id' => $clientId,
        'resource' => OAuth::resource(),
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_client');
});

it('revokes the token family when concurrent refreshers race on the same refresh token', function (): void {
    $role = Role::query()->create([
        'name' => 'mcp-race-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);
    $user = User::factory()->create(['is_active' => true]);
    $user->syncRoles([$role]);

    $issued = OAuth::issueAccessToken($this, $user, [
        'scopes' => ['mcp:read'],
        'role_id' => $role->id,
    ]);

    $accessToken = Token::query()->where('api_key_id', $issued['grant']->id)->sole();
    $refreshToken = RefreshToken::query()->where('access_token_id', $accessToken->id)->sole();
    $repository = app(McpOAuthRefreshTokenRepositoryService::class);

    // Winner of the race: atomic UPDATE … WHERE revoked = 0 succeeds.
    $repository->revokeRefreshToken((string) $refreshToken->id);
    expect($refreshToken->fresh()->revoked)->toBeTrue()
        ->and($issued['grant']->fresh()->isRevoked())->toBeFalse();

    // Loser: zero rows updated → reuse → revoke the family.
    $repository->revokeRefreshToken((string) $refreshToken->id);

    expect($issued['grant']->fresh()->isRevoked())->toBeTrue()
        ->and(Token::query()->where('api_key_id', $issued['grant']->id)->where('revoked', false)->count())->toBe(0);
});

it('does not revoke a new grant when an old refresh token from a prior consent is reused', function (): void {
    $role = Role::query()->create([
        'name' => 'mcp-reconsent-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);
    $user = User::factory()->create(['is_active' => true]);
    $user->syncRoles([$role]);

    $first = OAuth::issueAccessToken($this, $user, [
        'scopes' => ['mcp:read', 'collections:read'],
        'role_id' => $role->id,
    ]);
    $oldRefresh = $first['refresh_token'];

    $pkce = OAuth::pkcePair();
    $consentPage = OAuth::openConsent($this, $user, $first['client_id'], $pkce['challenge'], 'mcp:read');
    $clientRedirect = OAuth::approve($this, $consentPage, ['scopes' => ['mcp:read'], 'role_id' => $role->id]);
    $secondAccess = (string) OAuth::exchangeCode($this, $first['client_id'], OAuth::codeFrom($clientRedirect), $pkce['verifier'])
        ->assertOk()
        ->json('access_token');
    auth()->forgetGuards();

    $this->post('/oauth/token', [
        'grant_type' => 'refresh_token',
        'refresh_token' => $oldRefresh,
        'client_id' => $first['client_id'],
        'resource' => OAuth::resource(),
    ])->assertStatus(400);

    $activeGrant = ApiKey::query()
        ->where('oauth_client_id', $first['client_id'])
        ->whereNull('revoked_at')
        ->sole();

    expect($first['grant']->fresh()->isRevoked())->toBeTrue()
        ->and($activeGrant->id)->not->toBe($first['grant']->id)
        ->and($activeGrant->scopes)->toBe(['mcp:read']);

    OAuth::mcpRequest($this, $secondAccess)->assertOk();
});

it('unmaps IPv4-mapped, IPv4-compatible and NAT64 IPv6 addresses before building throttle keys', function (string $remoteAddr): void {
    $request = Request::create('/', 'POST', server: ['REMOTE_ADDR' => $remoteAddr]);
    $plain = Request::create('/', 'POST', server: ['REMOTE_ADDR' => '203.0.113.50']);

    expect(McpOAuthServiceProvider::clientThrottleKey($request))
        ->toBe(McpOAuthServiceProvider::clientThrottleKey($plain))
        ->toBe('203.0.113.50');
})->with([
    'ipv4-mapped' => ['::ffff:203.0.113.50'],
    'ipv4-compatible' => ['::203.0.113.50'],
    'nat64 well-known' => ['64:ff9b::203.0.113.50'],
]);

it('advertises discovery URLs from config app.url even when the Host header differs', function (): void {
    config([
        'app.url' => 'https://configured.example',
        'mcp.authorization_server' => 'https://configured.example',
    ]);

    $this->withServerVariables(['HTTP_HOST' => 'spoofed.example'])
        ->getJson('/.well-known/oauth-protected-resource/mcp')
        ->assertOk()
        ->assertJson([
            'resource' => 'https://configured.example/mcp',
            'authorization_servers' => ['https://configured.example'],
        ]);

    $this->withServerVariables(['HTTP_HOST' => 'spoofed.example'])
        ->getJson('/.well-known/oauth-authorization-server')
        ->assertOk()
        ->assertJson([
            'issuer' => 'https://configured.example',
            'authorization_endpoint' => 'https://configured.example/oauth/authorize',
            'token_endpoint' => 'https://configured.example/oauth/token',
        ]);
});

it('treats world-readable Passport key files as missing and answers 503', function (): void {
    $privatePath = Passport::keyPath('oauth-private.key');
    $publicPath = Passport::keyPath('oauth-public.key');
    $keyPair = (function (): array {
        $privateKey = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        assert($privateKey !== false);
        openssl_pkey_export($privateKey, $privatePem);
        $details = openssl_pkey_get_details($privateKey);
        assert(is_array($details));

        return ['private' => (string) $privatePem, 'public' => (string) $details['key']];
    })();

    file_put_contents($privatePath, $keyPair['private']);
    file_put_contents($publicPath, $keyPair['public']);
    chmod($privatePath, 0644);
    chmod($publicPath, 0644);

    config([
        'passport.private_key' => null,
        'passport.public_key' => null,
    ]);

    expect(app(McpOAuthServerService::class)->hasPassportKeys())->toBeFalse();

    $this->getJson('/.well-known/oauth-authorization-server')
        ->assertStatus(503)
        ->assertJsonPath('error', 'temporarily_unavailable');

    @unlink($privatePath);
    @unlink($publicPath);
});
