<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\ApiKeyScopeEnum;
use App\Models\ApiKey;
use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Active API key bound to a fresh role, with `collections:write` and `files:write`: the role
 * ACL decides what it may do, as for a 1.4.0 key without read_only. The plain secret is never stored: a test that
 * calls the API with the key uses {@see ApiKeyFactory::withSecret()} to choose it.
 *
 * @extends Factory<ApiKey>
 */
class ApiKeyFactory extends Factory
{
    protected $model = ApiKey::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $secret = ApiKey::generateSecret();

        return [
            'name' => fake()->company(),
            'key_prefix' => $secret['prefix'],
            'key_hash' => $secret['hash'],
            'role_id' => Role::factory(),
            'scopes' => [ApiKeyScopeEnum::CollectionsWrite->value, ApiKeyScopeEnum::FilesWrite->value],
        ];
    }

    /**
     * Store the hash of a known plain secret (from {@see ApiKey::generateSecret()}), so the
     * test can send it as a bearer token.
     *
     * @param  array{plain: string, prefix: string, hash: string}  $secret
     */
    public function withSecret(array $secret): static
    {
        return $this->state(fn (): array => [
            'key_prefix' => $secret['prefix'],
            'key_hash' => $secret['hash'],
        ]);
    }

    /**
     * Replace the scopes, e.g. `withScopes(ApiKeyScopeEnum::McpRead)` for a key that may only
     * list the MCP tools.
     */
    public function withScopes(ApiKeyScopeEnum ...$scopes): static
    {
        return $this->state(fn (): array => [
            'scopes' => array_map(static fn (ApiKeyScopeEnum $scope): string => $scope->value, $scopes),
        ]);
    }

    public function readOnly(): static
    {
        return $this->withScopes(ApiKeyScopeEnum::CollectionsRead, ApiKeyScopeEnum::FilesRead);
    }

    public function revoked(): static
    {
        return $this->state(fn (): array => [
            'revoked_at' => now()->subMinute(),
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn (): array => [
            'expires_at' => now()->subMinute(),
        ]);
    }
}
