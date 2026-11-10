<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Ai\Concerns\EnforcesAiFileAccessTrait;
use App\Ai\Support\AiActivityLogger;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\ResponseFactory;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Title;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('get_file')]
#[Title('Get file')]
#[Description('Return file metadata by id (no binary). Requires CanShowFiles; honors file ACL, read_private, and API key files_scope.')]
#[IsReadOnly]
class GetFile extends Tool
{
    use EnforcesAiFileAccessTrait;

    /**
     * @return array<string, Type>
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'file_id' => $schema->integer()->description('File id')->required(),
        ];
    }

    public function handle(Request $request): Response|ResponseFactory
    {
        $user = auth()->user();

        if (! $user instanceof User) {
            return Response::error('Unauthenticated.');
        }

        if (! app(EffectivePermissionResolverService::class)->hasPermission($user, PermissionEnum::CanShowFiles->value)) {
            return Response::error('Missing permission (CanShowFiles).');
        }

        $fileId = (int) $request->get('file_id');
        $file = File::query()->with('tags')->find($fileId);

        if ($file === null || $this->guardAiFileReadable($file) !== null) {
            AiActivityLogger::tool($user, 'get_file', ['file_id' => $fileId], 'not found', failed: true, extra: ['surface' => 'mcp']);

            return Response::error('File not found.');
        }

        $payload = [
            'id' => $file->id,
            'name' => $file->name,
            'path' => $file->path,
            'mime_type' => $file->mime_type,
            'size' => $file->size,
            'is_folder' => $file->isFolder(),
            'parent_id' => $file->parent_id,
            'tags' => $file->tags->pluck('name')->values()->all(),
        ];

        AiActivityLogger::tool(
            $user,
            'get_file',
            ['file_id' => $fileId],
            json_encode($payload) ?: '',
            extra: ['surface' => 'mcp'],
        );

        return Response::structured($payload);
    }
}
