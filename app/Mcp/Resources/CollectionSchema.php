<?php

declare(strict_types=1);

namespace App\Mcp\Resources;

use App\Ai\Concerns\EnforcesAiCollectionPermissionsTrait;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\MimeType;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Contracts\HasUriTemplate;
use Laravel\Mcp\Server\Resource;
use Laravel\Mcp\Support\UriTemplate;

#[Name('collection_schema')]
#[Title('Collection schema')]
#[Description('Field schema for a collection identified by slug.')]
#[MimeType('application/json')]
class CollectionSchema extends Resource implements HasUriTemplate
{
    use EnforcesAiCollectionPermissionsTrait;

    public function uriTemplate(): UriTemplate
    {
        return new UriTemplate('externa://collections/{slug}/schema');
    }

    public function handle(Request $request): Response|ResponseFactory
    {
        $user = auth()->user();

        if (! $user instanceof User) {
            return Response::error('Unauthenticated.');
        }

        if (! app(EffectivePermissionResolverService::class)->hasPermission($user, PermissionEnum::CanShowCollections->value)) {
            return Response::error('Collection not found.');
        }

        $slug = (string) $request->get('slug', '');
        $collection = Collection::query()->with('fields')->where('slug', $slug)->first();

        if ($collection === null || ! $this->isAiCollectionReadable($collection)) {
            return Response::error('Collection not found.');
        }

        $fields = $this->readableAiFields($collection)->map(static fn (CollectionField $field): array => [
            'id' => $field->id,
            'name' => $field->name,
            'type' => $field->type->value ?? $field->type,
            'required' => $field->isRequired(),
            'translatable' => (bool) $field->translatable,
        ])->values()->all();

        return Response::structured([
            'id' => $collection->id,
            'name' => $collection->name,
            'slug' => $collection->slug,
            'fields' => $fields,
        ]);
    }
}
