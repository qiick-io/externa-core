<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Every scope an API key can hold, in the shared vocabulary `^[a-z][a-z0-9-]*:(read|write)$`.
 *
 * A scope is a resource and an action. `write` implies `read` on the same resource, so a key
 * stores one scope per resource, the highest it holds ({@see self::highestPerResource()}), and a
 * `read` check is satisfied by `read` or `write` ({@see self::satisfies()}). Nothing else carries
 * permission meaning on a key: `collection_slugs` narrows which collections, never what may be
 * done with them.
 *
 * - `collections`: the public collections and items API (REST, GraphQL) and the MCP item tools;
 * - `files`: the public files API, file fields expanded in item payloads and the MCP file tools;
 * - `mcp`: the MCP endpoint itself, `read` for the read tools and `write` for the write tools.
 */
enum ApiKeyScopeEnum: string
{
    case CollectionsRead = 'collections:read';
    case CollectionsWrite = 'collections:write';
    case FilesRead = 'files:read';
    case FilesWrite = 'files:write';
    case McpRead = 'mcp:read';
    case McpWrite = 'mcp:write';

    public const string PATTERN = '/^[a-z][a-z0-9-]*:(read|write)$/D';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(
            static fn (self $case): string => $case->value,
            self::cases(),
        );
    }

    public function resource(): string
    {
        return explode(':', $this->value, 2)[0];
    }

    public function isWrite(): bool
    {
        return str_ends_with($this->value, ':write');
    }

    /**
     * Whether holding this scope passes a check for the required one: same resource, and either
     * the same action or `write` standing in for `read`.
     */
    public function satisfies(self $requiredScope): bool
    {
        return $this->resource() === $requiredScope->resource()
            && ($this->isWrite() || ! $requiredScope->isWrite());
    }

    /**
     * The scope a collection action needs: reading items needs `collections:read`, creating,
     * updating and deleting them `collections:write`.
     */
    public static function forCollectionAction(CollectionPermissionActionEnum $action): self
    {
        return $action === CollectionPermissionActionEnum::Read ? self::CollectionsRead : self::CollectionsWrite;
    }

    /**
     * The scope a file action needs: `read` and `read_private` need `files:read`, every other
     * action `files:write`.
     */
    public static function forFileAction(FilePermissionActionEnum $action): self
    {
        return in_array($action, [FilePermissionActionEnum::Read, FilePermissionActionEnum::ReadPrivate], true)
            ? self::FilesRead
            : self::FilesWrite;
    }

    /**
     * The permissions a user must hold to issue a key with this scope: a key never holds more
     * than the person who created it. `write` needs the `read` permission too, since it implies it.
     *
     * @return list<PermissionEnum>
     */
    public function requiredCreatorPermissions(): array
    {
        return match ($this) {
            self::CollectionsRead => [PermissionEnum::CanShowCollections],
            self::CollectionsWrite => [PermissionEnum::CanShowCollections, PermissionEnum::CanEditCollections],
            self::FilesRead => [PermissionEnum::CanShowFiles],
            self::FilesWrite => [PermissionEnum::CanShowFiles, PermissionEnum::CanEditFiles],
            self::McpRead, self::McpWrite => [PermissionEnum::CanUseAi],
        };
    }

    /**
     * Parse a stored scope list, failing closed: anything that is not a list of known scopes
     * (a null, a string, an object, one unknown entry) yields no scopes at all, so a key whose
     * scopes no longer parse is refused rather than half-trusted.
     *
     * @return list<self>
     */
    public static function parseStored(mixed $storedScopes): array
    {
        if (! is_array($storedScopes) || ! array_is_list($storedScopes)) {
            return [];
        }

        $parsedScopes = [];

        foreach ($storedScopes as $storedScope) {
            $scope = is_string($storedScope) ? self::tryFrom($storedScope) : null;

            if ($scope === null) {
                return [];
            }

            $parsedScopes[] = $scope;
        }

        return $parsedScopes;
    }

    /**
     * Keep one scope per resource, the highest held, in declaration order (`files:read` and
     * `files:write` become `files:write`).
     *
     * @param  iterable<self>  $scopes
     * @return list<self>
     */
    public static function highestPerResource(iterable $scopes): array
    {
        $highestByResource = [];

        foreach ($scopes as $scope) {
            $heldScope = $highestByResource[$scope->resource()] ?? null;

            if ($heldScope === null || $scope->satisfies($heldScope)) {
                $highestByResource[$scope->resource()] = $scope;
            }
        }

        return array_values(array_filter(
            self::cases(),
            static fn (self $case): bool => in_array($case, $highestByResource, true),
        ));
    }
}
