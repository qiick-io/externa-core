<?php

declare(strict_types=1);

namespace App\Mcp\Tools;

use App\Ai\Support\AiActivityLogger;
use App\Enums\PermissionEnum;
use App\Models\File;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\FileService;
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

#[Name('tag_file')]
#[Title('Tag file')]
#[Description('Replace tags on a file. Requires AI_MCP_WRITE_ENABLED and mcp:write.')]
#[IsReadOnly(false)]
#[IsDestructive(false)]
class TagFile extends Tool
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
            'file_id' => $schema->integer()->description('File id')->required(),
            'tags_json' => $schema->string()->description('JSON array of tag names, e.g. ["hero","draft"]')->required(),
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

        if (! app(EffectivePermissionResolverService::class)->hasPermission($user, PermissionEnum::CanEditFiles->value)) {
            return Response::error('Missing permission (CanEditFiles).');
        }

        $fileId = (int) $request->get('file_id');
        $file = File::query()->find($fileId);

        if ($file === null) {
            AiActivityLogger::tool($user, 'tag_file', ['file_id' => $fileId], 'not found', failed: true, extra: ['surface' => 'mcp']);

            return Response::error('File not found.');
        }

        $decoded = json_decode((string) $request->get('tags_json', '[]'), true);

        if (! is_array($decoded)) {
            return Response::error('tags_json must be a JSON array of strings.');
        }

        /** @var list<string> $tags */
        $tags = array_values(array_filter(array_map(
            static fn (mixed $tag): string => is_string($tag) ? trim($tag) : '',
            $decoded,
        ), static fn (string $tag): bool => $tag !== ''));

        $updated = app(FileService::class)->syncTags($file, $tags);
        $payload = [
            'status' => 'ok',
            'file_id' => $updated->id,
            'tags' => $updated->tags->pluck('name')->values()->all(),
        ];

        AiActivityLogger::tool(
            $user,
            'tag_file',
            ['file_id' => $fileId, 'tags' => $tags],
            json_encode($payload) ?: '',
            extra: ['surface' => 'mcp'],
        );

        return Response::structured($payload);
    }
}
