<?php

declare(strict_types=1);

use App\Enums\ApiKeyScopeEnum;
use App\Enums\PermissionEnum;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Facades\Route;
use Tests\Support\McpOAuthTestHelpers as OAuth;

/**
 * An install that never configures OAuth notices nothing (#802): no OAuth or discovery route
 * answers, `/mcp` sends the challenge it sent in 1.5.0, a token that is not an API key is just
 * an unknown API key, and API keys keep working.
 */
beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    OAuth::enableOAuth();
    config(['ai.mcp.oauth.enabled' => false]);
});

dataset('oauth routes', [
    'protected resource metadata' => ['get', '/.well-known/oauth-protected-resource/mcp'],
    'root protected resource metadata' => ['get', '/.well-known/oauth-protected-resource'],
    'authorization server metadata' => ['get', '/.well-known/oauth-authorization-server'],
    'registration' => ['post', '/oauth/register'],
    'authorization' => ['get', '/oauth/authorize'],
    'approval' => ['post', '/oauth/authorize'],
    'denial' => ['delete', '/oauth/authorize'],
    'token' => ['post', '/oauth/token'],
]);

it('answers 404 on every OAuth route while OAuth is off', function (string $method, string $uri): void {
    $this->actingAs(User::factory()->create())->json($method, $uri)->assertNotFound();
})->with('oauth routes');

it('answers 404 on every OAuth route while MCP itself is off, even with OAuth on', function (string $method, string $uri): void {
    config(['ai.mcp.enabled' => false, 'ai.mcp.oauth.enabled' => true]);

    $this->actingAs(User::factory()->create())->json($method, $uri)->assertNotFound();
})->with('oauth routes');

it('registers none of Passport\'s own routes', function (): void {
    $uris = collect(Route::getRoutes()->getRoutes())->map(fn (Illuminate\Routing\Route $route): string => $route->uri());

    expect($uris->filter(fn (string $uri): bool => str_starts_with($uri, 'oauth/'))->sort()->values()->all())
        ->toBe(['oauth/authorize', 'oauth/authorize', 'oauth/authorize', 'oauth/register', 'oauth/token']);
});

it('keeps the 1.5.0 challenge on /mcp, without a metadata link', function (?string $bearer): void {
    $request = $bearer === null ? $this : $this->withToken($bearer);

    $response = $request->postJson('/mcp', [], ['Accept' => 'application/json, text/event-stream']);

    $response->assertUnauthorized();
    expect($response->headers->get('WWW-Authenticate'))->toBe('Bearer realm="mcp", error="invalid_token"');
})->with([
    'no credentials' => [null],
    'an unknown API key' => ['ext_test_ABCDEFGH'.str_repeat('x', 32)],
    'a JWT-shaped token' => ['eyJ0eXAiOiJKV1QifQ.eyJzdWIiOiIxIn0.c2ln'],
]);

it('treats a token that is not an API key as an unknown API key', function (): void {
    OAuth::mcpRequest($this, 'eyJ0eXAiOiJKV1QifQ.eyJzdWIiOiIxIn0.c2ln')
        ->assertUnauthorized()
        ->assertJsonPath('error', 'invalid_token')
        ->assertJsonPath('message', 'The API key is not valid.');
});

it('keeps accepting API keys', function (): void {
    $role = Role::query()->create(['name' => 'mcp-off-'.uniqid(), 'guard_name' => 'web', 'is_system' => false, 'is_assignable' => true]);
    $role->syncPermissions([PermissionEnum::CanUseAi->value]);
    $owner = User::factory()->create(['is_active' => true]);
    $owner->syncRoles([$role]);

    $apiKey = OAuth::issueApiKey($owner, $role, [ApiKeyScopeEnum::McpRead->value]);

    OAuth::mcpRequest($this, $apiKey)->assertOk();
});
