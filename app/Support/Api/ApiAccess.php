<?php

namespace App\Support\Api;

use App\Models\ApiKey;
use App\Models\Role;

/**
 * Resolved actor for a public CMS API request.
 */
final class ApiAccess
{
    public function __construct(
        public readonly string $actor,
        public readonly Role $role,
        public readonly ?ApiKey $apiKey = null,
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
     * Keys that share a role but differ in collection_slugs / read_only must
     * not share cached payloads (includes and field ACL intersect with scopes).
     *
     * @return array{api_key_scopes: array{collection_slugs: list<string>|null, read_only: bool}|null}
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
                'read_only' => (bool) $apiKey->read_only,
            ],
        ];
    }
}
