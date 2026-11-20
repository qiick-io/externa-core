<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Models\ApiKey;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use stdClass;
use Tests\TestCase;

/**
 * Drives OAuth for remote MCP clients (#802) the way a connector does: dynamic registration,
 * the authorization request with PKCE, the user's consent, the code exchange, then MCP calls
 * with the access token. Tests go through the real endpoints rather than minting tokens, so
 * what they prove is what a client gets.
 *
 * `$test` is the running test case ({@see TestCase}, or Pest's `test()` proxy of it).
 */
final class McpOAuthTestHelpers
{
    public const string REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

    /** @var array{private: string, public: string}|null */
    private static ?array $keyPair = null;

    /**
     * Turn MCP and OAuth on, with an RSA key pair generated once per test process.
     */
    public static function enableOAuth(): void
    {
        self::$keyPair ??= self::generateKeyPair();

        config([
            'ai.mcp.enabled' => true,
            'ai.mcp.oauth.enabled' => true,
            'ai.mcp.rate_limit_per_minute' => 1000,
            'passport.private_key' => self::$keyPair['private'],
            'passport.public_key' => self::$keyPair['public'],
        ]);
    }

    public static function resource(): string
    {
        return rtrim(url('/'), '/').'/mcp';
    }

    /**
     * Register a public client through RFC 7591; its `client_id`.
     */
    public static function registerClient(object $test, string $redirectUri = self::REDIRECT_URI, string $clientName = 'Claude'): string
    {
        return (string) $test->postJson('/oauth/register', [
            'client_name' => $clientName,
            'redirect_uris' => [$redirectUri],
        ])->assertCreated()->json('client_id');
    }

    /**
     * @return array{verifier: string, challenge: string}
     */
    public static function pkcePair(): array
    {
        $verifier = Str::random(64);

        return [
            'verifier' => $verifier,
            'challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
        ];
    }

    /**
     * The authorization request a connector opens in the browser.
     *
     * @param  array<string, string>  $overrides
     */
    public static function authorizationUrl(string $clientId, string $codeChallenge, ?string $scope = null, array $overrides = []): string
    {
        return '/oauth/authorize?'.http_build_query(array_filter([
            'response_type' => 'code',
            'client_id' => $clientId,
            'redirect_uri' => self::REDIRECT_URI,
            'scope' => $scope,
            'state' => 'state-value',
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
            'resource' => self::resource(),
            ...$overrides,
        ], static fn (?string $value): bool => $value !== null));
    }

    /**
     * Open the consent screen as the user; the response (an Inertia page).
     */
    public static function openConsent(object $test, User $user, string $clientId, string $codeChallenge, ?string $scope = null): TestResponse
    {
        return $test->actingAs($user)->get(self::authorizationUrl($clientId, $codeChallenge, $scope));
    }

    /**
     * Approve on the consent screen that was just opened; the response (a redirect to the client).
     *
     * @param  array<string, mixed>  $choices  `scopes`, `role_id`, `collection_slugs`
     */
    public static function approve(object $test, TestResponse $consentPage, array $choices): TestResponse
    {
        return $test->post('/oauth/authorize', [
            'auth_token' => $consentPage->inertiaProps('authToken'),
            ...$choices,
        ]);
    }

    /**
     * The authorization code in the redirect back to the client.
     */
    public static function codeFrom(TestResponse $clientRedirect): string
    {
        $location = (string) $clientRedirect->headers->get('Location');
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

        return (string) ($query['code'] ?? '');
    }

    /**
     * Exchange a code at the token endpoint; the response.
     *
     * @param  array<string, string>  $overrides
     */
    public static function exchangeCode(object $test, string $clientId, string $code, string $verifier, array $overrides = []): TestResponse
    {
        return $test->post('/oauth/token', [
            'grant_type' => 'authorization_code',
            'client_id' => $clientId,
            'redirect_uri' => self::REDIRECT_URI,
            'code' => $code,
            'code_verifier' => $verifier,
            'resource' => self::resource(),
            ...$overrides,
        ]);
    }

    /**
     * The whole flow for a user who approves `$choices`: register, authorize, approve, exchange.
     *
     * @param  array<string, mixed>  $choices  `scopes`, `role_id`, `collection_slugs`
     * @return array{access_token: string, refresh_token: string, client_id: string, grant: ApiKey}
     */
    public static function issueAccessToken(object $test, User $user, array $choices, ?string $requestedScope = null): array
    {
        $clientId = self::registerClient($test);
        $pkce = self::pkcePair();
        $consentPage = self::openConsent($test, $user, $clientId, $pkce['challenge'], $requestedScope)->assertOk();
        $clientRedirect = self::approve($test, $consentPage, $choices)->assertRedirect();
        $tokens = self::exchangeCode($test, $clientId, self::codeFrom($clientRedirect), $pkce['verifier'])
            ->assertOk()
            ->json();

        // The next calls are a connector's, not the browser's: no session user.
        auth()->forgetGuards();

        /** @var ApiKey $grant */
        $grant = ApiKey::query()->where('oauth_client_id', $clientId)->where('owner_id', $user->id)->latest('id')->firstOrFail();

        return [
            'access_token' => (string) $tokens['access_token'],
            'refresh_token' => (string) $tokens['refresh_token'],
            'client_id' => $clientId,
            'grant' => $grant,
        ];
    }

    /**
     * An owned API key with exactly the given role, scopes and collections: the other door.
     *
     * @param  list<string>  $scopes
     * @param  list<string>|null  $collectionSlugs
     */
    public static function issueApiKey(User $owner, Role $role, array $scopes, ?array $collectionSlugs = null): string
    {
        $secret = ApiKey::generateSecret();

        ApiKey::query()->create([
            'name' => 'Parity key',
            'key_prefix' => $secret['prefix'],
            'key_hash' => $secret['hash'],
            'role_id' => $role->id,
            'owner_id' => $owner->id,
            'created_by' => $owner->id,
            'scopes' => $scopes,
            'collection_slugs' => $collectionSlugs,
        ]);

        return $secret['plain'];
    }

    /**
     * One JSON-RPC request to `/mcp` with the bearer credential; the response.
     *
     * @param  array<string, mixed>  $params
     */
    public static function mcpRequest(object $test, string $bearer, string $method = 'server/discover', array $params = [], ?string $name = null): TestResponse
    {
        return $test->withToken($bearer)->postJson('/mcp', [
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
        ], [
            'Accept' => 'application/json, text/event-stream',
            'MCP-Protocol-Version' => '2026-07-28',
            'Mcp-Method' => $method,
            ...($name !== null ? ['Mcp-Name' => $name] : []),
        ]);
    }

    /**
     * Call an MCP tool; whether it failed and its text (tool text or JSON-RPC error message).
     *
     * @param  array<string, mixed>  $arguments
     * @return array{status: int, failed: bool, text: string}
     */
    public static function mcpTool(object $test, string $bearer, string $tool, array $arguments = []): array
    {
        $response = self::mcpRequest($test, $bearer, 'tools/call', ['name' => $tool, 'arguments' => $arguments], $tool);
        $body = $response->json() ?? [];
        $text = $body['result']['structuredContent']['result']
            ?? $body['result']['content'][0]['text']
            ?? $body['error']['message']
            ?? $body['message']
            ?? '';

        return [
            'status' => $response->getStatusCode(),
            'failed' => $response->getStatusCode() >= 400 || isset($body['error']) || ($body['result']['isError'] ?? false) === true,
            'text' => is_string($text) ? $text : (string) json_encode($text),
        ];
    }

    /**
     * The tool names `tools/list` returns for the credential.
     *
     * @return list<string>
     */
    public static function mcpToolNames(object $test, string $bearer): array
    {
        return collect(self::mcpRequest($test, $bearer, 'tools/list')->json('result.tools') ?? [])->pluck('name')->all();
    }

    /**
     * @return array{private: string, public: string}
     */
    private static function generateKeyPair(): array
    {
        $privateKey = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        assert($privateKey !== false);
        openssl_pkey_export($privateKey, $privatePem);
        $details = openssl_pkey_get_details($privateKey);
        assert(is_array($details));

        return ['private' => (string) $privatePem, 'public' => (string) $details['key']];
    }
}
