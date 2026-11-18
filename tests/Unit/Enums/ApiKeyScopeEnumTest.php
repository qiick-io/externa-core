<?php

declare(strict_types=1);

use App\Enums\ApiKeyScopeEnum;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FilePermissionActionEnum;

/**
 * The API key vocabulary (#781): `<resource>:<read|write>`, write implies read on the same
 * resource only, and a stored list that does not parse grants nothing.
 */
test('every scope is in the shared vocabulary', function (): void {
    foreach (ApiKeyScopeEnum::values() as $scopeValue) {
        expect($scopeValue)->toMatch(ApiKeyScopeEnum::PATTERN);
    }
});

test('write satisfies read on the same resource, and nothing else crosses', function (ApiKeyScopeEnum $heldScope, ApiKeyScopeEnum $requiredScope, bool $isSatisfied): void {
    expect($heldScope->satisfies($requiredScope))->toBe($isSatisfied);
})->with([
    'read for read' => [ApiKeyScopeEnum::CollectionsRead, ApiKeyScopeEnum::CollectionsRead, true],
    'write for read' => [ApiKeyScopeEnum::CollectionsWrite, ApiKeyScopeEnum::CollectionsRead, true],
    'write for write' => [ApiKeyScopeEnum::FilesWrite, ApiKeyScopeEnum::FilesWrite, true],
    'read for write' => [ApiKeyScopeEnum::FilesRead, ApiKeyScopeEnum::FilesWrite, false],
    'mcp:read for mcp:write' => [ApiKeyScopeEnum::McpRead, ApiKeyScopeEnum::McpWrite, false],
    'other resource, write for read' => [ApiKeyScopeEnum::CollectionsWrite, ApiKeyScopeEnum::FilesRead, false],
    'mcp:write for collections:write' => [ApiKeyScopeEnum::McpWrite, ApiKeyScopeEnum::CollectionsWrite, false],
]);

test('a stored list parses only when every entry is a known scope', function (mixed $storedScopes, array $expectedScopes): void {
    expect(ApiKeyScopeEnum::parseStored($storedScopes))->toBe($expectedScopes);
})->with([
    'known scopes' => [['files:read', 'mcp:write'], [ApiKeyScopeEnum::FilesRead, ApiKeyScopeEnum::McpWrite]],
    'empty list' => [[], []],
    'null' => [null, []],
    'a string' => ['collections:write', []],
    'a map' => [['collections' => 'write'], []],
    'one unknown entry' => [['collections:write', 'users:write'], []],
    'wrong case' => [['Collections:Write'], []],
    'a non-string entry' => [['collections:write', true], []],
]);

test('only the highest scope per resource is kept', function (): void {
    expect(ApiKeyScopeEnum::highestPerResource([
        ApiKeyScopeEnum::FilesRead,
        ApiKeyScopeEnum::McpRead,
        ApiKeyScopeEnum::FilesWrite,
        ApiKeyScopeEnum::CollectionsRead,
    ]))->toBe([ApiKeyScopeEnum::CollectionsRead, ApiKeyScopeEnum::FilesWrite, ApiKeyScopeEnum::McpRead]);
});

test('reads need the read scope and every other action the write scope', function (): void {
    expect(ApiKeyScopeEnum::forCollectionAction(CollectionPermissionActionEnum::Read))->toBe(ApiKeyScopeEnum::CollectionsRead)
        ->and(ApiKeyScopeEnum::forFileAction(FilePermissionActionEnum::Read))->toBe(ApiKeyScopeEnum::FilesRead)
        ->and(ApiKeyScopeEnum::forFileAction(FilePermissionActionEnum::ReadPrivate))->toBe(ApiKeyScopeEnum::FilesRead);

    foreach ([CollectionPermissionActionEnum::Create, CollectionPermissionActionEnum::Update, CollectionPermissionActionEnum::Delete] as $collectionAction) {
        expect(ApiKeyScopeEnum::forCollectionAction($collectionAction))->toBe(ApiKeyScopeEnum::CollectionsWrite);
    }

    foreach ([FilePermissionActionEnum::Create, FilePermissionActionEnum::Update, FilePermissionActionEnum::Delete] as $fileAction) {
        expect(ApiKeyScopeEnum::forFileAction($fileAction))->toBe(ApiKeyScopeEnum::FilesWrite);
    }
});
