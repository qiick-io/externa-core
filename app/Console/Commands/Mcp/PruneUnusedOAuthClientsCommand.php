<?php

declare(strict_types=1);

namespace App\Console\Commands\Mcp;

use App\Models\ApiKey;
use App\Services\Mcp\McpOAuthServerService;
use Illuminate\Console\Command;
use Laravel\Passport\Client;
use Symfony\Component\Console\Attribute\AsCommand;

/**
 * Delete MCP OAuth clients that never completed an authorisation and are older than the
 * configured retention (default 24 hours) (#815).
 *
 * A successful authorisation is any `api_keys` row with that `oauth_client_id` (including a
 * later-revoked grant). Clients that only registered themselves and never received consent
 * are removed so open DCR cannot fill the clients table forever.
 */
#[AsCommand(name: 'mcp:prune-unused-oauth-clients')]
class PruneUnusedOAuthClientsCommand extends Command
{
    protected $signature = 'mcp:prune-unused-oauth-clients
                            {--dry-run : List clients that would be deleted without deleting them}';

    protected $description = 'Delete unused MCP OAuth clients with no successful authorisation';

    public function handle(McpOAuthServerService $oauthServer): int
    {
        $retentionHours = $oauthServer->unusedClientRetentionHours();
        $cutoff = now()->subHours($retentionHours);
        $authorizedClientIds = ApiKey::query()
            ->whereNotNull('oauth_client_id')
            ->distinct()
            ->pluck('oauth_client_id');

        $query = Client::query()
            ->where('created_at', '<', $cutoff)
            ->whereNotIn('id', $authorizedClientIds);

        $count = (clone $query)->count();

        if ($this->option('dry-run')) {
            $this->info(sprintf(
                '%d unused OAuth client(s) older than %d hour(s) would be deleted.',
                $count,
                $retentionHours,
            ));

            return self::SUCCESS;
        }

        $deleted = $query->delete();
        $this->info(sprintf('Deleted %d unused OAuth client(s).', $deleted));

        return self::SUCCESS;
    }
}
