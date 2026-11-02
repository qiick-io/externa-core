<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Ai\Support\AiActivityLogger;
use App\Enums\PermissionEnum;
use App\Models\CollectionItem;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Collections\CollectionItemPublisherService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsDestructive;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;
use Throwable;

#[Name('publish_item')]
#[Title('Publish item')]
#[Description('Promote draft values to published via CollectionItemPublisherService. Requires MCP write.')]
#[IsReadOnly(false)]
#[IsDestructive(false)]
class PublishItem extends Tool
{
    public function shouldRegister(): bool
    {
        if (! (bool) config('ai.mcp.write_enabled', false)) {
            return false;
        }

        if (request()->attributes->get('mcp_can_write') === false) {
            return false;
        }

        return true;
    }

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'item_id' => $schema->integer()->description('Collection item id')->required(),
        ];
    }

    public function handle(Request $request): Response|ResponseFactory
    {
        if (! (bool) config('ai.mcp.write_enabled', false)) {
            return Response::error('MCP write tools are disabled.');
        }

        if (request()->attributes->get('mcp_can_write') === false) {
            return Response::error('API key lacks mcp:write scope (or is read_only).');
        }

        $user = auth()->user();

        if (! $user instanceof User) {
            return Response::error('Unauthenticated.');
        }

        if (! app(EffectivePermissionResolverService::class)->hasPermission($user, PermissionEnum::CanEditCollections->value)) {
            return Response::error('Missing permission (CanEditCollections).');
        }

        $itemId = (int) $request->get('item_id');
        $item = CollectionItem::query()->with('collection')->find($itemId);

        if ($item === null || $item->collection === null) {
            AiActivityLogger::tool($user, 'publish_item', ['item_id' => $itemId], 'not found', failed: true, extra: ['surface' => 'mcp']);

            return Response::error('Item not found.');
        }

        try {
            app(CollectionItemPublisherService::class)->promote($item, $item->collection);
        } catch (Throwable $exception) {
            AiActivityLogger::tool(
                $user,
                'publish_item',
                ['item_id' => $itemId],
                $exception->getMessage(),
                failed: true,
                extra: ['surface' => 'mcp'],
            );

            return Response::error($exception->getMessage());
        }

        $payload = [
            'status' => 'ok',
            'item_id' => $item->id,
            'collection_id' => $item->collection_id,
            'published_at' => $item->fresh()?->published_at?->toIso8601String(),
        ];

        AiActivityLogger::tool(
            $user,
            'publish_item',
            ['item_id' => $itemId],
            json_encode($payload) ?: '',
            extra: ['surface' => 'mcp'],
        );

        return Response::structured($payload);
    }
}
