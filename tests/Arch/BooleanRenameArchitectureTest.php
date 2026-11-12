<?php

declare(strict_types=1);

use App\Enums\FieldTypeEnum;
use App\Models\CollectionField;
use App\Services\Api\CollectionPermissionRulesService;
use App\Services\Auth\OidcSocialiteFactoryService;
use App\Services\Authorization\SuperAdminGuardService;
use App\Services\Chat\ChatService;
use App\Services\Collections\FieldConditionEvaluatorService;
use App\Services\Collections\UniqueCollectionSlugGeneratorService;
use App\Services\GitExport\GitExportRepositoryService;
use App\Services\Search\MeilisearchClientService;
use App\Support\Health\ReadinessChecks;

/**
 * Boolean helpers renamed in #366 keep their is/has/can prefix.
 * A stale squash (#371) silently reverted most of them once (#457).
 */
test('boolean helpers renamed in #366 keep their prefixed names', function (string $class, string $method, string $legacyName): void {
    expect(method_exists($class, $method))->toBeTrue()
        ->and(method_exists($class, $legacyName))->toBeFalse();
})->with([
    [FieldTypeEnum::class, 'isTranslatableSupported', 'supportsTranslatable'],
    [CollectionField::class, 'hasArrayStorage', 'usesArrayStorage'],
    [CollectionPermissionRulesService::class, 'isFieldAllowed', 'fieldAllowed'],
    [CollectionPermissionRulesService::class, 'isMatchingItem', 'itemMatches'],
    [CollectionPermissionRulesService::class, 'isMatchingMergedItem', 'itemMatchesMerged'],
    [SuperAdminGuardService::class, 'hasSuperAdminRole', 'includesSuperAdminRole'],
    [SuperAdminGuardService::class, 'hasSuperAdminRoleName', 'includesSuperAdminRoleName'],
    [SuperAdminGuardService::class, 'hasSuperAdminGroup', 'includesSuperAdminGroup'],
    [SuperAdminGuardService::class, 'hasSuperAdminUser', 'includesSuperAdminUser'],
    [ChatService::class, 'canUserReadCollection', 'userCanReadCollection'],
    [ChatService::class, 'isMatchingQuery', 'matchesQuery'],
    [FieldConditionEvaluatorService::class, 'isMatchingRules', 'rulesMatch'],
    [OidcSocialiteFactoryService::class, 'isEnabled', 'enabled'],
    [GitExportRepositoryService::class, 'isEnabled', 'enabled'],
    [MeilisearchClientService::class, 'isEnabled', 'enabled'],
    [UniqueCollectionSlugGeneratorService::class, 'isAvailable', 'available'],
    [ReadinessChecks::class, 'isRedisRequired', 'redisRequired'],
]);
