<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Enums\ApiKeyScopeEnum;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * An API key or an OAuth access token refused by the authenticating middleware or a scope check,
 * rendered the same way on every surface (REST, GraphQL transport, MCP) and for both credentials,
 * so a client or an agent learns one error vocabulary (#781, #802) and can tell the cases apart:
 *
 * - `401` `invalid_token`: unknown, expired or revoked key or token, a token issued for another
 *   resource, or an owner who can no longer act;
 * - `403` `insufficient_scope`: the key lacks the scope the request needs (named in `scope`);
 * - `403` `ip_not_allowed`: the caller's address is outside the key's `ip_allowlist`.
 *
 * Both RFC 6750 cases carry a `WWW-Authenticate: Bearer error="…"` header. The message never
 * echoes the presented token.
 */
final class ApiKeyRejectedException extends HttpException
{
    private function __construct(
        int $statusCode,
        string $message,
        private readonly string $errorCode,
        private readonly ?ApiKeyScopeEnum $requiredScope = null,
    ) {
        $authenticateHeader = $errorCode === 'ip_not_allowed'
            ? []
            : ['WWW-Authenticate' => $this->authenticateHeaderValue($errorCode, $requiredScope)];

        parent::__construct($statusCode, $message, null, $authenticateHeader);
    }

    public static function unknownKey(): self
    {
        return new self(401, __('The API key is not valid.'), 'invalid_token');
    }

    public static function expiredKey(bool $isAccessToken = false): self
    {
        return new self(
            401,
            $isAccessToken ? __('The access token has expired.') : __('The API key has expired.'),
            'invalid_token',
        );
    }

    public static function revokedKey(bool $isAccessToken = false): self
    {
        return new self(
            401,
            $isAccessToken ? __('The access token has been revoked.') : __('The API key has been revoked.'),
            'invalid_token',
        );
    }

    /**
     * An OAuth access token that cannot be used: malformed, badly signed, issued for another
     * resource, or bound to a grant or client that no longer matches it.
     */
    public static function invalidAccessToken(string $reason): self
    {
        return new self(401, $reason, 'invalid_token');
    }

    /**
     * The key itself is fine but cannot act: its owner is deactivated or deleted, its role is
     * gone or is super-admin, or (MCP) it has no owner at all.
     */
    public static function unusableKey(string $reason): self
    {
        return new self(401, $reason, 'invalid_token');
    }

    public static function insufficientScope(ApiKeyScopeEnum $requiredScope, bool $isAccessToken = false): self
    {
        $message = $isAccessToken
            ? __('The access token lacks the :scope scope.', ['scope' => $requiredScope->value])
            : __('The API key lacks the :scope scope.', ['scope' => $requiredScope->value]);

        return new self(403, $message, 'insufficient_scope', $requiredScope);
    }

    /**
     * The key holds no scope at all (or its stored scopes no longer parse), so every request
     * is refused before it reaches a route.
     */
    public static function noScopes(bool $isAccessToken = false): self
    {
        return new self(
            403,
            $isAccessToken ? __('The access token holds no scopes.') : __('The API key holds no scopes.'),
            'insufficient_scope',
        );
    }

    public static function ipNotAllowed(): self
    {
        return new self(403, __('API key is not allowed from this IP address.'), 'ip_not_allowed');
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }

    public function render(): JsonResponse
    {
        $payload = ['message' => $this->getMessage(), 'error' => $this->errorCode];

        if ($this->requiredScope !== null) {
            $payload['scope'] = $this->requiredScope->value;
        }

        return response()->json($payload, $this->getStatusCode(), $this->getHeaders());
    }

    private function authenticateHeaderValue(string $errorCode, ?ApiKeyScopeEnum $requiredScope): string
    {
        $headerValue = sprintf('Bearer error="%s"', $errorCode);

        if ($requiredScope !== null) {
            $headerValue .= sprintf(', scope="%s"', $requiredScope->value);
        }

        return $headerValue;
    }
}
