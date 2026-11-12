<?php

declare(strict_types=1);

namespace App\Mcp\Servers;

use App\Mcp\Adapters\RegistryMcpToolAdapter;
use App\Mcp\Resources\CollectionItem;
use App\Mcp\Resources\CollectionSchema;
use App\Mcp\Resources\CollectionsIndex;
use App\Mcp\Resources\FileMetadata;
use App\Mcp\Tools\CreateItem;
use App\Mcp\Tools\DescribeCollection;
use App\Mcp\Tools\GetFile;
use App\Mcp\Tools\GetItem;
use App\Mcp\Tools\ListCollections;
use App\Mcp\Tools\ListFiles;
use App\Mcp\Tools\ListItems;
use App\Mcp\Tools\MoveFile;
use App\Mcp\Tools\PublishItem;
use App\Mcp\Tools\Search;
use App\Mcp\Tools\TagFile;
use App\Mcp\Tools\UpdateItem;
use App\Support\AppVersion;
use Laravel\Mcp\Server;
use Laravel\Mcp\Server\Attributes\Instructions;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Contracts\Transport;
use Laravel\Mcp\Server\Prompt;
use Laravel\Mcp\Server\Tool;

/**
 * First-party Externa MCP server (streamable HTTP at /mcp).
 *
 * Tools are thin adapters over {@see RegistryMcpToolAdapter}
 * / the shared AI registry (#202/#203). Write tools register only when
 * AI_MCP_WRITE_ENABLED is true (and the caller has mcp:write when using API keys).
 */
#[Name('Externa')]
#[Instructions(
    'Externa CMS MCP server. Use read tools/resources to inspect collections, items, and files under the caller\'s permissions. Write tools require AI_MCP_WRITE_ENABLED and mcp:write; mutating registry calls may need human approval. No delete tools in this MVP.'
)]
class ExternaServer extends Server
{
    protected string $name = 'Externa';

    protected string $version = '1.0.0';

    protected string $instructions = <<<'MARKDOWN'
Externa CMS MCP server. Read collections, items, and files under the authenticated identity's permissions. Writes require AI_MCP_WRITE_ENABLED + mcp:write and may need human approval. No delete tools.
MARKDOWN;

    /** @var array<int, class-string<Tool>> */
    protected array $tools = [
        ListCollections::class,
        DescribeCollection::class,
        ListItems::class,
        GetItem::class,
        Search::class,
        ListFiles::class,
        GetFile::class,
        CreateItem::class,
        UpdateItem::class,
        PublishItem::class,
        MoveFile::class,
        TagFile::class,
    ];

    /** @var array<int, class-string<Server\Resource>> */
    protected array $resources = [
        CollectionsIndex::class,
        CollectionSchema::class,
        CollectionItem::class,
        FileMetadata::class,
    ];

    /** @var array<int, class-string<Prompt>> */
    protected array $prompts = [];

    public function __construct(
        Transport $transport,
    ) {
        parent::__construct($transport);

        $this->version = AppVersion::current();
    }
}
