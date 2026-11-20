<?php

declare(strict_types=1);

namespace App\Actions\Mcp;

use App\Models\ApiKey;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Passport\AuthCode;
use Laravel\Passport\Client;
use Laravel\Passport\RefreshToken;
use Laravel\Passport\Token;

/**
 * Block a dynamically registered MCP OAuth client (#815): revoke the client row and every
 * credential it holds (grants, tokens, codes), so the next call and the next consent fail.
 */
final class BlockMcpOAuthClientAction
{
    public function execute(Client $client, User $actor): void
    {
        DB::transaction(function () use ($client, $actor): void {
            $client->forceFill(['revoked' => true])->save();

            $tokenIds = Token::query()->where('client_id', $client->getKey())->pluck('id');
            Token::query()->whereIn('id', $tokenIds)->update(['revoked' => true]);
            RefreshToken::query()->whereIn('access_token_id', $tokenIds)->update(['revoked' => true]);
            AuthCode::query()->where('client_id', $client->getKey())->update(['revoked' => true]);

            ApiKey::query()
                ->where('oauth_client_id', $client->getKey())
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);

            activity('api-keys')
                ->causedBy($actor)
                ->event('oauth_client_blocked')
                ->withProperties([
                    'oauth_client_id' => (string) $client->getKey(),
                    'name' => $client->name,
                ])
                ->log('MCP OAuth client blocked');
        });
    }
}
