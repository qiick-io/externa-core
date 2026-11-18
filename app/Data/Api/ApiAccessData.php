<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Enums\ApiKeyScopeEnum;
use App\Models\ApiKey;
use App\Models\Role;

/**
 * Resolved actor for a public CMS API request.
 */
final readonly class ApiAccessData
{
    public function __construct(
        public string $actor,
        public Role $role,
        public ?ApiKey $apiKey = null,
    ) {}

    public function isPublic(): bool
    {
        return $this->actor === 'public';
    }

    public function roleId(): int
    {
        return (int) $this->role->id;
    }

    /**
     * Factors that partition public response caches beyond role_id.
     *
     * Keys that share a role but differ in collection_slugs, scopes or owner must not share
     * cached payloads.
     *
     * @return array{api_key_scopes: array{collection_slugs: list<string>|null, scopes: list<string>, owner_id: int|null}|null}
     */
    public function responseCacheScopeFactors(): array
    {
        $apiKey = $this->apiKey;
        if ($apiKey === null) {
            return ['api_key_scopes' => null];
        }

        $slugs = $apiKey->collection_slugs;
        $normalized = null;
        if (is_array($slugs)) {
            $normalized = array_values(array_unique(array_filter(array_map(
                static fn (mixed $value): string => strtolower(trim((string) $value)),
                $slugs,
            ), static fn (string $value): bool => $value !== '')));
            sort($normalized);
        }

        return [
            'api_key_scopes' => [
                'collection_slugs' => $normalized,
                'scopes' => array_map(
                    static fn (ApiKeyScopeEnum $scope): string => $scope->value,
                    $apiKey->grantedScopes(),
                ),
                'owner_id' => $apiKey->owner_id !== null ? (int) $apiKey->owner_id : null,
            ],
        ];
    }
}
