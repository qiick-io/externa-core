<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Enums\ApiKeyScopeEnum;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * An API key refused by the authenticating middleware or a scope check, rendered the same way on
 * every surface (REST, GraphQL transport, MCP) so a client or an agent can tell the cases apart:
 *
 * - `401` `invalid_token`: unknown, expired or revoked key, or an owner who can no longer act;
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

    public static function expiredKey(): self
    {
        return new self(401, __('The API key has expired.'), 'invalid_token');
    }

    public static function revokedKey(): self
    {
        return new self(401, __('The API key has been revoked.'), 'invalid_token');
    }

    /**
     * The key itself is fine but cannot act: its owner is deactivated or deleted, its role is
     * gone or is super-admin, or (MCP) it has no owner at all.
     */
    public static function unusableKey(string $reason): self
    {
        return new self(401, $reason, 'invalid_token');
    }

    public static function insufficientScope(ApiKeyScopeEnum $requiredScope): self
    {
        return new self(
            403,
            __('The API key lacks the :scope scope.', ['scope' => $requiredScope->value]),
            'insufficient_scope',
            $requiredScope,
        );
    }

    /**
     * The key holds no scope at all (or its stored scopes no longer parse), so every request
     * is refused before it reaches a route.
     */
    public static function noScopes(): self
    {
        return new self(403, __('The API key holds no scopes.'), 'insufficient_scope');
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
