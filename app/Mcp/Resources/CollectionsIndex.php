<?php

declare(strict_types=1);

namespace App\Mcp\Resources;

use App\Ai\Concerns\EnforcesAiCollectionPermissionsTrait;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\MimeType;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Attributes\Uri;
use Laravel\Mcp\Server\Resource;

#[Name('collections')]
#[Title('Collections index')]
#[Description('Collections visible to the authenticated identity (collection ACL and API key collection_slugs).')]
#[Uri('externa://collections')]
#[MimeType('application/json')]
class CollectionsIndex extends Resource
{
    use EnforcesAiCollectionPermissionsTrait;

    public function handle(Request $request): Response|ResponseFactory
    {
        $user = auth()->user();

        if (! $user instanceof User) {
            return Response::error('Unauthenticated.');
        }

        if (! app(EffectivePermissionResolverService::class)->hasPermission($user, PermissionEnum::CanShowCollections->value)) {
            return Response::structured(['collections' => []]);
        }

        $collections = Collection::query()
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'is_singleton'])
            ->filter(fn (Collection $collection): bool => $this->isAiCollectionReadable($collection))
            ->map(static fn (Collection $collection): array => [
                'id' => $collection->id,
                'name' => $collection->name,
                'slug' => $collection->slug,
                'is_singleton' => (bool) $collection->is_singleton,
                'uri' => 'externa://collections/'.$collection->slug.'/schema',
            ])
            ->values()
            ->all();

        return Response::structured(['collections' => $collections]);
    }
}
