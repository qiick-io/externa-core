<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Http\Responses\PasskeyLoginResponse;
use App\Models\Role;
use App\Models\User;
use App\Services\Auth\HomePathService;
use App\Services\Mcp\McpOAuthServerService;
use Database\Seeders\PermissionSeeder;
use Illuminate\Http\Request;
use Laravel\Fortify\Features;
use Laravel\Passkeys\Contracts\PasskeyLoginResponse as PasskeyLoginResponseContract;
use Laravel\Passport\Client;
use Laravel\Passport\RefreshToken;
use Laravel\Passport\Token;
use Tests\Support\McpOAuthTestHelpers as OAuth;

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    OAuth::enableOAuth();

    $this->role = Role::query()->create([
        'name' => 'mcp-oauth-adv-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $this->role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);

    $this->user = User::factory()->create([
        'email' => 'mcp-adv-'.uniqid().'@example.test',
        'password' => 'password',
        'is_active' => true,
        'email_verified_at' => now(),
    ]);
    $this->user->syncRoles([$this->role]);
});

it('answers 503 on POST /mcp when OAuth is on and Passport keys are missing', function (): void {
    config([
        'passport.private_key' => null,
        'passport.public_key' => null,
    ]);

    foreach (['oauth-private.key', 'oauth-public.key'] as $fileName) {
        $path = storage_path($fileName);

        if (is_file($path)) {
            unlink($path);
        }
    }

    expect(app(McpOAuthServerService::class)->isEnabled())->toBeTrue()
        ->and(app(McpOAuthServerService::class)->hasPassportKeys())->toBeFalse()
        ->and(app(McpOAuthServerService::class)->isReady())->toBeFalse();

    $this->postJson('/mcp', [
        'jsonrpc' => '2.0',
        'id' => 1,
        'method' => 'tools/list',
        'params' => [],
    ], [
        'Authorization' => 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
    ])->assertStatus(503)
        ->assertJsonPath('error', 'temporarily_unavailable')
        ->assertJsonMissing(['error' => 'invalid_token']);
});

it('keeps the oauth authorize query string after password login and reaches consent', function (): void {
    $clientId = OAuth::registerClient($this);
    $pkce = OAuth::pkcePair();
    $authorizeUrl = OAuth::authorizationUrl($clientId, $pkce['challenge'], 'mcp:use');

    $this->get($authorizeUrl)->assertRedirect('/login');

    $this->withSession(['url.intended' => url($authorizeUrl)])
        ->post('/login', [
            'email' => $this->user->email,
            'password' => 'password',
        ])
        ->assertRedirect($authorizeUrl);

    $this->assertAuthenticatedAs($this->user);

    $this->get($authorizeUrl)
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('oauth/authorize'));

    $consent = OAuth::openConsent($this, $this->user, $clientId, $pkce['challenge'], 'mcp:use');
    $redirect = OAuth::approve($this, $consent, [
        'scopes' => ['mcp:read'],
        'role_id' => $this->role->id,
    ])->assertRedirect();

    expect(OAuth::codeFrom($redirect))->not->toBe('');
});

it('keeps the oauth authorize query string after passkey login', function (): void {
    $this->skipUnlessFortifyFeature(Features::passkeys());

    $clientId = OAuth::registerClient($this);
    $pkce = OAuth::pkcePair();
    $authorizeUrl = OAuth::authorizationUrl($clientId, $pkce['challenge'], 'mcp:use');

    expect(app(PasskeyLoginResponseContract::class))->toBeInstanceOf(PasskeyLoginResponse::class);

    $request = Request::create('/passkeys/login', 'POST');
    $request->setUserResolver(fn () => $this->user);
    $request->headers->set('Accept', 'application/json');
    $request->setLaravelSession(tap(app('session.store'), function ($session) use ($authorizeUrl): void {
        $session->start();
        $session->put('url.intended', url($authorizeUrl));
    }));

    $response = app(PasskeyLoginResponseContract::class)->toResponse($request);
    $payload = json_decode((string) $response->getContent(), true);

    expect($response->getStatusCode())->toBe(200)
        ->and($payload['redirect'])->toBe(url($authorizeUrl));
});

it('refuses a demoted owner after consent', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, [
        'scopes' => ['mcp:read'],
        'role_id' => $this->role->id,
    ]);

    OAuth::mcpRequest($this, $issued['access_token'])->assertOk();

    $this->user->syncRoles([]);

    OAuth::mcpRequest($this, $issued['access_token'])->assertUnauthorized();
});

it('revokes the token family when a used refresh token is presented again', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, [
        'scopes' => ['mcp:read'],
        'role_id' => $this->role->id,
    ]);
    $oldRefresh = $issued['refresh_token'];

    $refreshed = $this->post('/oauth/token', [
        'grant_type' => 'refresh_token',
        'refresh_token' => $oldRefresh,
        'client_id' => $issued['client_id'],
        'resource' => OAuth::resource(),
    ])->assertOk()->json();

    expect($refreshed['refresh_token'])->not->toBe($oldRefresh);

    $this->post('/oauth/token', [
        'grant_type' => 'refresh_token',
        'refresh_token' => $oldRefresh,
        'client_id' => $issued['client_id'],
        'resource' => OAuth::resource(),
    ])->assertStatus(400);

    expect($issued['grant']->fresh()->isRevoked())->toBeTrue()
        ->and(Token::query()->where('api_key_id', $issued['grant']->id)->where('revoked', false)->count())->toBe(0)
        ->and(RefreshToken::query()->where('revoked', false)->whereIn(
            'access_token_id',
            Token::query()->where('api_key_id', $issued['grant']->id)->pluck('id'),
        )->count())->toBe(0);

    OAuth::mcpRequest($this, $refreshed['access_token'])->assertUnauthorized();
});

it('refuses redirect URIs with fragments and dangerous schemes', function (): void {
    config(['mcp.custom_schemes' => ['javascript', 'cursor']]);

    $this->postJson('/oauth/register', [
        'client_name' => 'Bad fragment',
        'redirect_uris' => ['https://example.com/callback#fragment'],
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_redirect_uri');

    $this->postJson('/oauth/register', [
        'client_name' => 'Bad scheme',
        'redirect_uris' => ['javascript:alert(1)'],
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_redirect_uri');
});

it('requires the resource parameter on authorize and token', function (): void {
    $clientId = OAuth::registerClient($this);
    $pkce = OAuth::pkcePair();

    $this->get('/oauth/authorize?'.http_build_query([
        'response_type' => 'code',
        'client_id' => $clientId,
        'redirect_uri' => OAuth::REDIRECT_URI,
        'code_challenge' => $pkce['challenge'],
        'code_challenge_method' => 'S256',
    ]))->assertStatus(400)->assertJsonPath('error', 'invalid_target');

    $this->post('/oauth/token', [
        'grant_type' => 'refresh_token',
        'refresh_token' => 'not-a-token',
        'client_id' => $clientId,
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_target');
});

it('blocks existing clients when their redirect host is blocked', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, [
        'scopes' => ['mcp:read'],
        'role_id' => $this->role->id,
    ]);

    $adminRole = Role::query()->create([
        'name' => 'mcp-oauth-host-admin-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $adminRole->syncPermissions([PermissionEnum::CanManageApiKeys->value, PermissionEnum::CanUseAi->value]);
    $admin = User::factory()->create(['is_active' => true, 'email_verified_at' => now()]);
    $admin->syncRoles([$adminRole]);

    $this->actingAs($admin)
        ->post('/settings/mcp-oauth-clients/blocked-hosts', ['host' => 'claude.ai.'])
        ->assertRedirect();

    expect(Client::query()->findOrFail($issued['client_id'])->revoked)->toBeTrue()
        ->and($issued['grant']->fresh()->isRevoked())->toBeTrue();

    OAuth::mcpRequest($this, $issued['access_token'])->assertUnauthorized();
});

it('builds issuer and resource from config app.url not the Host header', function (): void {
    config(['app.url' => 'https://configured.example']);

    expect(app(McpOAuthServerService::class)->issuer())->toBe('https://configured.example')
        ->and(app(McpOAuthServerService::class)->resourceIdentifier())->toBe('https://configured.example/mcp');
});

it('keeps the intended oauth path with query in HomePathService::afterLogin', function (): void {
    $authorizePath = '/oauth/authorize?client_id=abc&code_challenge=xyz&code_challenge_method=S256&resource='.urlencode(OAuth::resource());
    $request = Request::create('/login', 'POST');
    $request->setUserResolver(fn () => $this->user);
    $request->setLaravelSession(tap(app('session.store'), function ($session) use ($authorizePath): void {
        $session->start();
        $session->put('url.intended', url($authorizePath));
    }));

    expect(HomePathService::afterLogin($request))->toBe($authorizePath);
});
