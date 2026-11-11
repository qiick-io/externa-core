<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\ApiKeyFilesScopeEnum;
use App\Models\ApiKey;
use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Active API key bound to a fresh role. The plain secret is never stored: a test that
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
            'read_only' => false,
            // Same as the column default: role ACL decides what the key may do with files.
            'files_scope' => ApiKeyFilesScopeEnum::All,
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

    public function readOnly(): static
    {
        return $this->state(fn (): array => [
            'read_only' => true,
        ]);
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
