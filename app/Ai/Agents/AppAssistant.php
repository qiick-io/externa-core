<?php

namespace App\Ai\Agents;

use App\Ai\Tools\ManageCollectionItems;
use App\Ai\Tools\ManageCollections;
use App\Ai\Tools\ManageFiles;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\Conversational;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Promptable;
use Stringable;

#[Provider('local')]
class AppAssistant implements Agent, Conversational, HasTools
{
    use Promptable;
    use RemembersConversations;

    /**
     * Get the instructions that the agent should follow.
     */
    public function instructions(): Stringable|string
    {
        return <<<'INSTRUCTIONS'
You are the internal assistant for this application (collections, items, and files).

Rules:
- Always use the provided tools for reads and writes. Never invent IDs, paths, or results.
- Respect permission errors from tools — tell the user clearly when a permission is missing.
- For destructive actions (delete / force-delete), confirm intent briefly, call the tool, then summarize what the tool returned.
- Prefer concise answers. When listing records, keep them short and actionable.
- You can create, read, update, delete collections and items; and list, create folders, rename, move, soft-delete, restore, or force-delete files.
INSTRUCTIONS;
    }

    /**
     * @return Tool[]
     */
    public function tools(): iterable
    {
        return [
            new ManageCollections,
            new ManageCollectionItems,
            new ManageFiles,
        ];
    }
}
