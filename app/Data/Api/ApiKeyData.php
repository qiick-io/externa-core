<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Enums\ApiKeyScopeEnum;
use App\Http\Requests\Admin\StoreApiKeyRequest;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Input for `CreateApiKeyAction`: a new key as {@see StoreApiKeyRequest} validated it.
 */
final readonly class ApiKeyData
{
    /**
     * @param  list<string>|null  $collectionSlugs  null = every collection the role may reach
     * @param  list<ApiKeyScopeEnum>  $scopes  one per resource, the highest held
     * @param  list<string>|null  $ipAllowlist  null = every address
     */
    public function __construct(
        public string $name,
        public int $roleId,
        public ?int $ownerId,
        public User $creator,
        public ?array $collectionSlugs,
        public array $scopes,
        public ?array $ipAllowlist,
        public ?int $rateLimitPerMinute,
        public ?CarbonImmutable $expiresAt,
    ) {}

    /**
     * The owner defaults to the creator: a key always acts as someone, and MCP refuses
     * ownerless keys.
     *
     * @param  array{name: string, role_id: int|string, owner_id?: int|string|null, collection_slugs?: list<string>|null, scopes: list<string>, ip_allowlist?: list<string>|null, rate_limit_per_minute?: int|string|null, expires_at?: string|null}  $validated
     */
    public static function fromValidated(User $creator, array $validated): self
    {
        return new self(
            name: $validated['name'],
            roleId: (int) $validated['role_id'],
            ownerId: isset($validated['owner_id']) ? (int) $validated['owner_id'] : $creator->id,
            creator: $creator,
            collectionSlugs: $validated['collection_slugs'] ?? null,
            scopes: ApiKeyScopeEnum::highestPerResource(array_map(
                ApiKeyScopeEnum::from(...),
                $validated['scopes'],
            )),
            ipAllowlist: $validated['ip_allowlist'] ?? null,
            rateLimitPerMinute: isset($validated['rate_limit_per_minute']) ? (int) $validated['rate_limit_per_minute'] : null,
            expiresAt: isset($validated['expires_at']) ? CarbonImmutable::parse($validated['expires_at']) : null,
        );
    }
}
