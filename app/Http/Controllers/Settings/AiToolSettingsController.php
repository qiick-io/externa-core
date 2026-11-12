<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Data\Ai\AiCatalogModelData;
use App\Data\Ai\AiConfiguredModelData;
use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Http\Requests\Settings\UpdateAiToolSettingsRequest;
use App\Services\Ai\AiModelCatalogService;
use App\Services\Ai\AiToolRegistryService;
use App\Services\Ai\AiToolWriteGateService;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Project settings for which mutating AI tool classes are enabled (env kill switch still applies).
 */
class AiToolSettingsController extends Controller
{
    use AuthorizesWithPermissionTrait;
    use LogsProjectSettingsUpdateTrait;

    public function __construct(
        private readonly AiToolWriteGateService $writeGate,
        private readonly AiToolRegistryService $registry,
        private readonly AiModelCatalogService $modelCatalog,
    ) {}

    public function edit(): Response
    {
        $this->authorizePermission(PermissionEnum::CanManageProjectSettings->value);

        $mutating = collect($this->registry->all())
            ->filter(fn ($definition): bool => $definition->kind()->isMutating())
            ->map(fn ($definition): array => [
                'name' => $definition->name(),
                'kind' => $definition->kind()->value,
                'description' => $definition->description(),
            ])
            ->values()
            ->all();

        return Inertia::render('settings/ai-tools', [
            'writeEnabled' => $this->writeGate->isWriteEnabled(),
            'enabledTools' => $this->writeGate->enabledWriteToolNames(),
            'tools' => $mutating,
            'approvalTtlMinutes' => (int) config('ai.tools.approval_ttl_minutes', 15),
            'auditRetentionDays' => (int) config('ai.tools.audit_retention_days', 90),
            'configuredModels' => array_map(
                static fn (AiConfiguredModelData $configuredModel): array => $configuredModel->toArray(),
                $this->modelCatalog->configuredModels(),
            ),
            'catalogModels' => array_map(
                static fn (AiCatalogModelData $catalogModel): array => $catalogModel->toArray(),
                $this->modelCatalog->catalog(),
            ),
        ]);
    }

    /**
     * Persist the enabled mutating tools; the request checks the settings permission before validating.
     *
     * A configured model the catalog marks deprecated adds a non-blocking `warning` flash (#370).
     */
    public function update(UpdateAiToolSettingsRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $allowedNames = collect($this->registry->all())
            ->filter(fn ($definition): bool => $definition->kind()->isMutating())
            ->map(fn ($definition): string => $definition->name())
            ->all();

        /** @var list<string> $requested */
        $requested = array_values(array_filter(
            $validated['write_tools'] ?? [],
            static fn (mixed $name): bool => is_string($name) && in_array($name, $allowedNames, true),
        ));

        $this->writeGate->setEnabledWriteToolNames($requested);

        $this->logProjectSettingsUpdate($request, 'ai_write_tools', [
            'write_tools' => $requested,
        ]);

        $redirect = redirect()
            ->route('ai-tools.edit')
            ->with('success', __('AI write tool settings saved.'));
        $deprecatedModelNames = array_map(
            static fn (AiConfiguredModelData $configuredModel): string => (string) $configuredModel->model,
            $this->modelCatalog->deprecatedConfiguredModels(),
        );

        if ($deprecatedModelNames !== []) {
            $redirect->with('warning', __('Deprecated AI model in use: :models. Switch to a recommended model.', [
                'models' => implode(', ', array_unique($deprecatedModelNames)),
            ]));
        }

        return $redirect;
    }
}
