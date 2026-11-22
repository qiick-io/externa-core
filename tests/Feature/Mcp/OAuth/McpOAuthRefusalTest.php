<?php

declare(strict_types=1);

use App\Enums\PermissionEnum;
use App\Models\ApiKey;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Passport\Bridge\AccessToken;
use Laravel\Passport\Bridge\Client as BridgeClient;
use Laravel\Passport\Bridge\Scope;
use Laravel\Passport\Client;
use Laravel\Passport\Passport;
use Laravel\Passport\Token;
use League\OAuth2\Server\CryptKey;
use Tests\Support\McpOAuthTestHelpers as OAuth;

/**
 * Every way an OAuth access token is refused at `/mcp` (#802), each with the RFC 6750 error it
 * carries, the same vocabulary as the API keys since #781: `401 invalid_token` for a token that
 * cannot be used, `403 insufficient_scope` (naming the scope) for one that may not do this, and
 * a `WWW-Authenticate` challenge that also points at the protected resource metadata.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->withoutVite();
    OAuth::enableOAuth();

    $this->role = Role::query()->create([
        'name' => 'mcp-oauth-refusal-'.uniqid(),
        'guard_name' => 'web',
        'is_system' => false,
        'is_assignable' => true,
    ]);
    $this->role->syncPermissions([PermissionEnum::CanUseAi->value, ...allCollectionPermissions()]);

    $this->user = User::factory()->create(['is_active' => true]);
    $this->user->syncRoles([$this->role]);
});

/**
 * Assert the RFC 6750 refusal: status, `error`, and the challenge naming the metadata.
 */
function assertMcpOAuthRefusal(TestResponse $response, int $status, string $error, ?string $scope = null): void
{
    $response->assertStatus($status)->assertJsonPath('error', $error);

    $expectedChallenge = sprintf(
        'Bearer realm="mcp", resource_metadata="%s/.well-known/oauth-protected-resource/mcp", error="%s"',
        rtrim(url('/'), '/'),
        $error,
    ).($scope !== null ? sprintf(', scope="%s"', $scope) : '');

    expect($response->headers->get('WWW-Authenticate'))->toBe($expectedChallenge);

    if ($scope !== null) {
        $response->assertJsonPath('scope', $scope);
    }
}

/**
 * A token as this server would sign it, for the one case the consent screen cannot produce (a
 * grant without an `mcp` scope): bound to `$grant`, for the MCP audience.
 *
 * @param  list<string>  $scopes
 */
function mintMcpAccessToken(User $user, ApiKey $grant, array $scopes): string
{
    /** @var Client $client */
    $client = Passport::client()->newQuery()->findOrFail($grant->oauth_client_id);
    $accessToken = new AccessToken(
        (string) $user->id,
        array_map(static fn (string $scope): Scope => new Scope($scope), $scopes),
        new BridgeClient((string) $client->getKey(), $client->name, $client->redirect_uris),
    );
    $accessToken->setIdentifier(bin2hex(random_bytes(40)));
    $accessToken->setExpiryDateTime(new DateTimeImmutable('+1 hour'));
    $accessToken->setPrivateKey(new CryptKey((string) config('passport.private_key'), null, false));

    Token::query()->forceCreate([
        'id' => $accessToken->getIdentifier(),
        'user_id' => $user->id,
        'client_id' => $client->getKey(),
        'scopes' => $scopes,
        'revoked' => false,
        'expires_at' => now()->addHour(),
        'api_key_id' => $grant->id,
        'audience' => OAuth::resource(),
    ]);

    return $accessToken->toString();
}

it('accepts the token it is compared against', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);

    OAuth::mcpRequest($this, $issued['access_token'])->assertOk();
});

it('refuses an expired token with invalid_token', function (): void {
    $alreadyExpired = new DateInterval('PT1M');
    $alreadyExpired->invert = 1;
    Passport::tokensExpireIn($alreadyExpired);

    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    $response = OAuth::mcpRequest($this, $issued['access_token']);

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The access token has expired.');
});

it('refuses a revoked token with invalid_token', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    Token::query()->where('api_key_id', $issued['grant']->id)->update(['revoked' => true]);

    $response = OAuth::mcpRequest($this, $issued['access_token']);

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The access token has been revoked.');
});

it('refuses a token whose grant was revoked with invalid_token, even while the token row is not', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    $issued['grant']->forceFill(['revoked_at' => now()])->save();

    $response = OAuth::mcpRequest($this, $issued['access_token']);

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The access token has been revoked.');
});

it('refuses a token whose grant lacks mcp:read with insufficient_scope, naming the scope', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read', 'collections:read'], 'role_id' => $this->role->id]);
    $issued['grant']->forceFill(['scopes' => ['collections:read']])->save();
    $tokenWithoutGrantMcp = mintMcpAccessToken($this->user, $issued['grant']->fresh(), ['mcp:use']);

    $response = OAuth::mcpRequest($this, $tokenWithoutGrantMcp);

    assertMcpOAuthRefusal($response, 403, 'insufficient_scope', 'mcp:read');
    $response->assertJsonPath('message', 'The access token lacks the mcp:read scope.');
});

it('refuses a token issued for another audience with invalid_token', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    Token::query()->where('api_key_id', $issued['grant']->id)->update(['audience' => 'https://other.example/mcp']);

    $response = OAuth::mcpRequest($this, $issued['access_token']);

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The access token was issued for another resource.');
});

it('refuses a token that names no audience at all', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    Token::query()->where('api_key_id', $issued['grant']->id)->update(['audience' => null]);

    assertMcpOAuthRefusal(OAuth::mcpRequest($this, $issued['access_token']), 401, 'invalid_token');
});

it('refuses a token that does not parse or is not signed by this server', function (string $presentedToken): void {
    $response = OAuth::mcpRequest($this, $presentedToken);

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The access token is not valid.');
})->with([
    'not a JWT' => 'not-a-token',
    'signed by someone else' => 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJ4IiwianRpIjoieCIsInN1YiI6IjEiLCJzY29wZXMiOlsibWNwOnJlYWQiXX0.c2lnbmF0dXJl',
]);

it('refuses a token whose client was revoked', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    Client::query()->whereKey($issued['client_id'])->update(['revoked' => true]);

    assertMcpOAuthRefusal(OAuth::mcpRequest($this, $issued['access_token']), 401, 'invalid_token');
});

it('refuses a token that is not bound to a grant', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    Token::query()->where('api_key_id', $issued['grant']->id)->update(['api_key_id' => null]);

    $response = OAuth::mcpRequest($this, $issued['access_token']);

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The access token is not bound to an authorization.');
});

it('refuses a token bound to another user\'s grant for the same client', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    $otherUser = User::factory()->create(['is_active' => true]);
    $otherUser->syncRoles([$this->role]);
    $issued['grant']->forceFill(['owner_id' => $otherUser->id])->save();

    assertMcpOAuthRefusal(OAuth::mcpRequest($this, $issued['access_token']), 401, 'invalid_token');
});

it('refuses a token that does not carry the mcp:use wire scope', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    $tokenWithoutWireScope = mintMcpAccessToken($this->user, $issued['grant']->fresh(), ['collections:read']);

    $response = OAuth::mcpRequest($this, $tokenWithoutWireScope);

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The access token no longer matches what was authorized. Authorize the client again.');
});

it('revokes the grant when its owner is deactivated, as it revokes their API keys', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    $this->user->forceFill(['is_active' => false])->save();

    $response = OAuth::mcpRequest($this, $issued['access_token']);

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The access token has been revoked.');
    expect($issued['grant']->fresh()->isRevoked())->toBeTrue();
});

it('refuses a token whose owner can no longer act, even before the grant is revoked', function (): void {
    $issued = OAuth::issueAccessToken($this, $this->user, ['scopes' => ['mcp:read'], 'role_id' => $this->role->id]);
    // Behind the model's back, so only the owner check itself stands in the way.
    DB::table('users')->where('id', $this->user->id)->update(['is_active' => false]);

    $response = OAuth::mcpRequest($this, $issued['access_token']);

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The account that authorized this access token is no longer active.');
});

it('answers a request without credentials with the bare challenge and no error code', function (): void {
    $response = $this->postJson('/mcp', [], ['Accept' => 'application/json, text/event-stream']);

    $response->assertUnauthorized();

    expect($response->headers->get('WWW-Authenticate'))->toBe(sprintf(
        'Bearer realm="mcp", resource_metadata="%s/.well-known/oauth-protected-resource/mcp"',
        rtrim(url('/'), '/'),
    ));
});

it('keeps refusing API keys with the API key wording when OAuth is on', function (): void {
    $response = OAuth::mcpRequest($this, 'ext_test_ABCDEFGH'.str_repeat('x', 32));

    assertMcpOAuthRefusal($response, 401, 'invalid_token');
    $response->assertJsonPath('message', 'The API key is not valid.');
});
