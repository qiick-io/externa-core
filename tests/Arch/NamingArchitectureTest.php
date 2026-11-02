<?php

declare(strict_types=1);

use App\Enums\FieldTypeEnum;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Models\CollectionField;
use App\Services\Api\CollectionPermissionRulesService;
use App\Services\Auth\OidcSocialiteFactoryService;
use App\Services\Authorization\SuperAdminGuardService;
use App\Services\Chat\ChatService;
use App\Services\Collections\FieldConditionEvaluatorService;
use App\Services\GitExport\GitExportRepositoryService;
use App\Services\Search\MeilisearchClientService;
use App\Support\Collections\UniqueCollectionSlugGenerator;
use App\Support\Health\ReadinessChecks;

/**
 * Codice Perfetto naming + architecture guardrails (issue #260).
 *
 * Scaffolding exemptions keep Laravel / Fortify / starter-kit names untouched.
 * App\Services use the Service suffix (#336). Custom middleware use the Middleware
 * suffix (#337); starter-kit Handle* middleware stay exempt.
 *
 * declare(strict_types=1) across App\ is deferred until the PHP baseline is clean;
 * new and touched files must still declare it.
 */
arch('no debugging helpers')
    ->expect(['dd', 'dump', 'ray', 'var_dump'])
    ->not->toBeUsed();

arch('env helper is not used outside config')
    ->expect('env')
    ->not->toBeUsed()
    ->ignoring('Config');

arch('controllers do not use the DB facade directly')
    ->expect('App\Http\Controllers')
    ->not->toUse('Illuminate\Support\Facades\DB');

arch('Models use bare domain nouns without a Model suffix')
    ->expect('App\Models')
    ->classes()
    ->not->toHaveSuffix('Model');

arch('data transfer objects are readonly and suffixed')
    ->expect('App\Data')
    ->classes()
    ->toBeReadonly()
    ->toHaveSuffix('Data');

arch('custom Actions have an Action suffix')
    ->expect('App\Actions')
    ->classes()
    ->toHaveSuffix('Action')
    ->ignoring('App\Actions\Fortify');

arch('Services end with Service')
    ->expect('App\Services')
    ->classes()
    ->toHaveSuffix('Service');

arch('Jobs end with Job')
    ->expect('App\Jobs')
    ->classes()
    ->toHaveSuffix('Job');

arch('Console Commands end with Command')
    ->expect('App\Console\Commands')
    ->classes()
    ->toHaveSuffix('Command');

arch('Events end with Event')
    ->expect('App\Events')
    ->classes()
    ->toHaveSuffix('Event');

arch('Enums end with Enum')
    ->expect('App\Enums')
    ->classes()
    ->toHaveSuffix('Enum');

arch('Controllers end with Controller')
    ->expect('App\Http\Controllers')
    ->classes()
    ->toHaveSuffix('Controller');

arch('Form Requests end with Request')
    ->expect('App\Http\Requests')
    ->classes()
    ->toHaveSuffix('Request');

arch('API Resources end with Resource')
    ->expect('App\Http\Resources')
    ->classes()
    ->toHaveSuffix('Resource');

arch('HTTP Responses end with Response')
    ->expect('App\Http\Responses')
    ->classes()
    ->toHaveSuffix('Response');

arch('Notifications end with Notification')
    ->expect('App\Notifications')
    ->classes()
    ->toHaveSuffix('Notification');

arch('Policies end with Policy')
    ->expect('App\Policies')
    ->classes()
    ->toHaveSuffix('Policy');

arch('Middleware end with Middleware')
    ->expect('App\Http\Middleware')
    ->classes()
    ->toHaveSuffix('Middleware')
    ->ignoring([
        // Starter-kit scaffolding (never rename).
        HandleAppearance::class,
        HandleInertiaRequests::class,
    ]);

arch('custom Traits end with Trait')
    ->expect('App')
    ->traits()
    ->toHaveSuffix('Trait')
    ->ignoring('App\Concerns');

arch('Builders end with Builder')
    ->expect('App\Builders')
    ->classes()
    ->toHaveSuffix('Builder');

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
    [UniqueCollectionSlugGenerator::class, 'isAvailable', 'available'],
    [ReadinessChecks::class, 'isRedisRequired', 'redisRequired'],
]);
