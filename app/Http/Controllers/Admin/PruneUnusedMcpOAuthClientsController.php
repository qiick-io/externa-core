<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Console\Commands\Mcp\PruneUnusedOAuthClientsCommand;
use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Artisan;

/**
 * Run the unused MCP OAuth client prune from the admin page (#815).
 */
class PruneUnusedMcpOAuthClientsController extends Controller
{
    public function __invoke(): RedirectResponse
    {
        Artisan::call(PruneUnusedOAuthClientsCommand::class);

        return back();
    }
}
