<?php

declare(strict_types=1);

namespace App\Mcp\Servers;

use App\Mcp\Adapters\RegistryMcpToolAdapter;
use App\Mcp\Resources\CollectionItem;
use App\Mcp\Resources\CollectionSchema;
use App\Mcp\Resources\CollectionsIndex;
use App\Mcp\Resources\FileMetadata;
use App\Mcp\Tools\CreateCollection;
use App\Mcp\Tools\CreateField;
use App\Mcp\Tools\CreateItem;
use App\Mcp\Tools\DescribeCollection;
use App\Mcp\Tools\GetFile;
use App\Mcp\Tools\GetItem;
use App\Mcp\Tools\ListCollections;
use App\Mcp\Tools\ListFiles;
use App\Mcp\Tools\ListItems;
use App\Mcp\Tools\MoveFile;
use App\Mcp\Tools\PublishItem;
use App\Mcp\Tools\ReorderFields;
use App\Mcp\Tools\Search;
use App\Mcp\Tools\TagFile;
use App\Mcp\Tools\UpdateField;
use App\Mcp\Tools\UpdateItem;
use App\Services\AppVersionService;
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
 * / the shared AI registry (#202/#203). Write tools register when AI_MCP_WRITE_ENABLED is on
 * (the default since #766) and the API key has mcp:write. There are no delete tools, and tools
 * that change users, roles or groups never reach MCP.
 */
#[Name('Externa')]
#[Instructions(
    'Externa CMS MCP server. Use read tools/resources to inspect collections, items, and files under the API key\'s permissions. With an mcp:write key, write tools create collections, add, change and reorder fields, and create, update and publish items; the install may require in-app approval for writes. No delete tools.'
)]
class ExternaServer extends Server
{
    protected string $name = 'Externa';

    protected string $version = '1.0.0';

    protected string $instructions = <<<'MARKDOWN'
Externa CMS MCP server. Read collections, items, and files under the API key's permissions. With an mcp:write key, write tools build collections (create_collection, create_field, update_field, reorder_fields) and fill them (create_item, update_item, publish_item); the install may require in-app approval for writes. No delete tools.
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
        CreateCollection::class,
        CreateField::class,
        UpdateField::class,
        ReorderFields::class,
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

        $this->version = app(AppVersionService::class)->current();
    }
}
