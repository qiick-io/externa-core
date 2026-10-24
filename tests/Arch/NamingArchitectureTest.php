<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\JobMonitorController;
use App\Http\Controllers\Ai\AiConversationController;
use App\Http\Middleware\ConfigurePublicApiCors;
use App\Http\Middleware\EnforcePublicApiOrigin;
use App\Http\Middleware\EnsureCanManageFiles;
use App\Http\Middleware\EnsureSidebarModuleEnabled;
use App\Http\Middleware\EnsureTwoFactorIsEnabled;
use App\Http\Middleware\EnsureUserHasPermission;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\ResolveApiAccess;
use App\Http\Middleware\SetLocale;
use App\Services\Ai\EmbeddingSimilarity;
use App\Services\Api\CollectionPermissionEnforcer;
use App\Services\Api\CollectionPermissionGuard;
use App\Services\Api\CollectionPermissionRules;
use App\Services\Api\CollectionPermissionSync;
use App\Services\Api\FileFieldExpander;
use App\Services\Api\FilePermissionGuard;
use App\Services\Api\FilePermissionSync;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Api\RelationIncludeHydrator;
use App\Services\Auth\OidcSocialiteFactory;
use App\Services\Auth\OidcUserResolver;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Chat\ChatParticipantSync;
use App\Services\Collections\CollectionFieldRenamer;
use App\Services\Collections\CollectionFormLayoutNormalizer;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemDataRuleBuilder;
use App\Services\Collections\CollectionItemPublisher;
use App\Services\Collections\CollectionItemRevisionPruner;
use App\Services\Collections\CollectionItemRevisionRecorder;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Collections\CollectionListColumnsNormalizer;
use App\Services\Collections\CollectionListDisplayEnricher;
use App\Services\Collections\FieldConditionEvaluator;
use App\Services\Collections\FieldValidationRuleEvaluator;
use App\Services\Collections\LivePreviewToken;
use App\Services\Collections\LivePreviewUrlBuilder;
use App\Services\Collections\PackFieldCreator;
use App\Services\Collections\WysiwygHtmlSanitizer;
use App\Services\Dashboard\DashboardHealthMetrics;
use App\Services\Files\FileWhereUsedScanner;
use App\Services\GitExport\GitExportDispatcher;
use App\Services\GitExport\GitExportDocumentBuilder;
use App\Services\GitExport\GitExportRepository;
use App\Services\Notifiers\OutboundNotifierContextBuilder;
use App\Services\Notifiers\OutboundNotifierFanout;
use App\Services\Notifiers\OutboundNotifierMessageFormatter;
use App\Services\Search\MeilisearchClient;
use App\Services\Search\MeilisearchDocumentBuilder;
use App\Services\Search\MeilisearchSyncDispatcher;
use App\Services\Settings\ProjectAppearance;
use App\Services\Settings\ProjectSettings;
use App\Services\Settings\SettingsRepository;
use App\Services\Settings\UserNotificationPreferences;
use App\Services\Webhooks\OutboundWebhookCatalog;
use App\Services\Webhooks\OutboundWebhookDeliveryLog;
use App\Services\Webhooks\OutboundWebhookDispatcher;

/**
 * Codice Perfetto naming + architecture guardrails (issue #260).
 *
 * Scaffolding exemptions keep Laravel / Fortify / starter-kit names untouched.
 * Legacy App\Services classes without a Service suffix and pre-existing custom
 * middleware without a Middleware suffix are ignored so new classes must comply
 * while #260 stays a mechanical rename (no Service/Middleware mass rename).
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
    ->not->toUse('Illuminate\Support\Facades\DB')
    ->ignoring([
        AiConversationController::class,
        JobMonitorController::class,
    ]);

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
    ->toHaveSuffix('Service')
    ->ignoring([
        EmbeddingSimilarity::class,
        CollectionPermissionEnforcer::class,
        CollectionPermissionGuard::class,
        CollectionPermissionRules::class,
        CollectionPermissionSync::class,
        FileFieldExpander::class,
        FilePermissionGuard::class,
        FilePermissionSync::class,
        PublicApiResponseCache::class,
        RelationIncludeHydrator::class,
        OidcSocialiteFactory::class,
        OidcUserResolver::class,
        EffectivePermissionResolver::class,
        ChatParticipantSync::class,
        CollectionFieldRenamer::class,
        CollectionFormLayoutNormalizer::class,
        CollectionItemDataNormalizer::class,
        CollectionItemDataRuleBuilder::class,
        CollectionItemPublisher::class,
        CollectionItemRevisionPruner::class,
        CollectionItemRevisionRecorder::class,
        CollectionItemValuesAssembler::class,
        CollectionItemValuesWriter::class,
        CollectionListColumnsNormalizer::class,
        CollectionListDisplayEnricher::class,
        FieldConditionEvaluator::class,
        FieldValidationRuleEvaluator::class,
        LivePreviewToken::class,
        LivePreviewUrlBuilder::class,
        PackFieldCreator::class,
        WysiwygHtmlSanitizer::class,
        DashboardHealthMetrics::class,
        FileWhereUsedScanner::class,
        GitExportDispatcher::class,
        GitExportDocumentBuilder::class,
        GitExportRepository::class,
        OutboundNotifierContextBuilder::class,
        OutboundNotifierFanout::class,
        OutboundNotifierMessageFormatter::class,
        MeilisearchClient::class,
        MeilisearchDocumentBuilder::class,
        MeilisearchSyncDispatcher::class,
        ProjectAppearance::class,
        ProjectSettings::class,
        SettingsRepository::class,
        UserNotificationPreferences::class,
        OutboundWebhookCatalog::class,
        OutboundWebhookDeliveryLog::class,
        OutboundWebhookDispatcher::class,
    ]);

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
        // Pre-#260 custom middleware; new middleware must use the Middleware suffix.
        ConfigurePublicApiCors::class,
        EnforcePublicApiOrigin::class,
        EnsureCanManageFiles::class,
        EnsureSidebarModuleEnabled::class,
        EnsureTwoFactorIsEnabled::class,
        EnsureUserHasPermission::class,
        ResolveApiAccess::class,
        SetLocale::class,
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
