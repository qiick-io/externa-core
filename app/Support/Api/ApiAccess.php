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
}
