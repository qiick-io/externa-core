<?php

declare(strict_types=1);

namespace App\Mcp\Resources;

use App\Enums\PermissionEnum;
use App\Models\File;
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

#[Name('file_metadata')]
#[Title('File metadata')]
#[Description('File metadata by id (no binary payload).')]
#[MimeType('application/json')]
class FileMetadata extends Resource implements HasUriTemplate
{
    public function uriTemplate(): UriTemplate
    {
        return new UriTemplate('externa://files/{id}');
    }

    public function handle(Request $request): Response|ResponseFactory
    {
        $user = auth()->user();

        if (! $user instanceof User) {
            return Response::error('Unauthenticated.');
        }

        if (! app(EffectivePermissionResolverService::class)->hasPermission($user, PermissionEnum::CanShowFiles->value)) {
            return Response::error('File not found.');
        }

        $fileId = (int) $request->get('id', 0);
        $file = File::query()->with('tags')->find($fileId);

        if ($file === null) {
            return Response::error('File not found.');
        }

        return Response::structured([
            'id' => $file->id,
            'name' => $file->name,
            'path' => $file->path,
            'mime_type' => $file->mime_type,
            'size' => $file->size,
            'is_folder' => $file->isFolder(),
            'parent_id' => $file->parent_id,
            'tags' => $file->tags->pluck('name')->values()->all(),
        ]);
    }
}
