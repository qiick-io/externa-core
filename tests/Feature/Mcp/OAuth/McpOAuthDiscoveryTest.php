<?php

declare(strict_types=1);

use App\Models\OAuthBlockedRedirectHost;
use Laravel\Mcp\Facades\Mcp;
use Laravel\Passport\Client;
use Tests\Support\McpOAuthTestHelpers as OAuth;

/**
 * The public discovery and registration contract of OAuth for remote MCP clients (#802 / #815).
 * Discovery comes from laravel/mcp's {@see Mcp::oauthRoutes()} (`mcp:use`
 * on the wire); registration adds governance the package cannot express.
 */
beforeEach(function (): void {
    OAuth::enableOAuth();
});

it('publishes the protected resource metadata of /mcp (RFC 9728) via laravel/mcp', function (string $metadataPath): void {
    $origin = rtrim(url('/'), '/');

    $this->getJson($metadataPath)->assertOk()->assertJson([
        'resource' => $origin.'/mcp',
        'authorization_servers' => [$origin],
        'scopes_supported' => ['mcp:use'],
    ]);
})->with([
    'path-inserted' => '/.well-known/oauth-protected-resource/mcp',
    'root' => '/.well-known/oauth-protected-resource',
]);

it('publishes the authorization server metadata (RFC 8414) with mcp:use', function (): void {
    $origin = rtrim(url('/'), '/');

    $this->getJson('/.well-known/oauth-authorization-server')->assertOk()->assertJson([
        'issuer' => $origin,
        'authorization_endpoint' => $origin.'/oauth/authorize',
        'token_endpoint' => $origin.'/oauth/token',
        'registration_endpoint' => $origin.'/oauth/register',
        'scopes_supported' => ['mcp:use'],
        'response_types_supported' => ['code'],
        'grant_types_supported' => ['authorization_code', 'refresh_token'],
        'code_challenge_methods_supported' => ['S256'],
    ]);
});

it('points an unauthenticated MCP request at the metadata it can then fetch', function (): void {
    $challenge = (string) $this->postJson('/mcp', [], ['Accept' => 'application/json, text/event-stream'])
        ->assertUnauthorized()
        ->headers->get('WWW-Authenticate');

    preg_match('/resource_metadata="([^"]+)"/', $challenge, $matches);

    expect($matches[1] ?? null)->toBe(rtrim(url('/'), '/').'/.well-known/oauth-protected-resource/mcp');
    $this->getJson((string) parse_url($matches[1], PHP_URL_PATH))->assertOk()->assertJsonPath('resource', OAuth::resource());
});

it('registers a client dynamically (RFC 7591) as a public client with mcp:use', function (): void {
    $response = $this->postJson('/oauth/register', [
        'client_name' => 'Claude',
        'redirect_uris' => [OAuth::REDIRECT_URI],
    ]);

    $response->assertCreated()
        ->assertJsonPath('scope', 'mcp:use')
        ->assertJsonPath('token_endpoint_auth_method', 'none')
        ->assertJsonPath('grant_types', ['authorization_code', 'refresh_token'])
        ->assertJsonPath('response_types', ['code'])
        ->assertJsonPath('redirect_uris', [OAuth::REDIRECT_URI]);

    $client = Client::query()->findOrFail($response->json('client_id'));

    expect($client->name)->toBe('Claude')
        ->and($client->secret)->toBeNull()
        ->and($client->revoked)->toBeFalse();
});

it('refuses a registration with a redirect URI it may not use', function (array $redirectUris): void {
    $this->postJson('/oauth/register', ['client_name' => 'Bad', 'redirect_uris' => $redirectUris])
        ->assertStatus(400)
        ->assertJsonPath('error', 'invalid_redirect_uri');

    expect(Client::query()->count())->toBe(0);
})->with([
    'not a URL' => [['not a url']],
    'unlisted private-use scheme' => [['cursor://anysphere.cursor-mcp/oauth/callback']],
    'credentials in the URL' => [['https://user:secret@claude.ai/callback']],
    'non-loopback http' => [['http://example.com/callback']],
]);

it('accepts loopback http and listed private-use schemes', function (string $redirectUri): void {
    config(['mcp.custom_schemes' => ['cursor']]);

    $this->postJson('/oauth/register', [
        'client_name' => 'Local',
        'redirect_uris' => [$redirectUri],
    ])->assertCreated();
})->with([
    'loopback' => ['http://127.0.0.1:8787/callback'],
    'ipv6 loopback' => ['http://[::1]:3000/cb'],
    'cursor scheme' => ['cursor://anysphere.cursor-mcp/oauth/callback'],
]);

it('limits unauthenticated registrations per address', function (): void {
    config(['ai.mcp.oauth.registrations_per_minute' => 2]);
    $registration = ['client_name' => 'Spam', 'redirect_uris' => [OAuth::REDIRECT_URI]];

    $this->postJson('/oauth/register', $registration)->assertCreated();
    $this->postJson('/oauth/register', $registration)->assertCreated();
    $this->postJson('/oauth/register', $registration)->assertTooManyRequests();

    expect(Client::query()->count())->toBe(2);
});

it('refuses registration when the global client cap is reached', function (): void {
    config(['ai.mcp.oauth.registrations_global_cap' => 1]);

    $this->postJson('/oauth/register', [
        'client_name' => 'First',
        'redirect_uris' => [OAuth::REDIRECT_URI],
    ])->assertCreated();

    $this->postJson('/oauth/register', [
        'client_name' => 'Second',
        'redirect_uris' => [OAuth::REDIRECT_URI],
    ])->assertStatus(503)->assertJsonPath('error', 'temporarily_unavailable');
});

it('refuses registration for a blocked redirect host', function (): void {
    OAuthBlockedRedirectHost::query()->create(['host' => 'claude.ai']);

    $this->postJson('/oauth/register', [
        'client_name' => 'Claude',
        'redirect_uris' => [OAuth::REDIRECT_URI],
    ])->assertStatus(400)->assertJsonPath('error', 'invalid_redirect_uri');
});
