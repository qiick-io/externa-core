<?php

namespace App\Http\Resources\Admin;

use App\Enums\ApiKeyFilesScopeEnum;
use App\Models\ApiKey;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ApiKey
 */
class ApiKeyResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'name' => $this->name,
            'key_prefix' => $this->key_prefix,
            'role_id' => $this->role_id,
            'role' => $this->whenLoaded('role', fn () => [
                'id' => $this->role?->id,
                'name' => $this->role?->name,
            ]),
            'owner_id' => $this->owner_id,
            'owner' => $this->whenLoaded('owner', fn () => $this->owner === null ? null : [
                'id' => $this->owner->id,
                'name' => $this->owner->name,
                'email' => $this->owner->email,
            ]),
            'collection_slugs' => $this->collection_slugs,
            'read_only' => (bool) $this->read_only,
            'files_scope' => $this->files_scope instanceof ApiKeyFilesScopeEnum
                ? $this->files_scope->value
                : (string) ($this->files_scope ?? 'all'),
            'ip_allowlist' => $this->ip_allowlist,
            'rate_limit_per_minute' => $this->rate_limit_per_minute,
            'expires_at' => $this->expires_at?->toIso8601String(),
            'last_used_at' => $this->last_used_at?->toIso8601String(),
            'revoked_at' => $this->revoked_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
