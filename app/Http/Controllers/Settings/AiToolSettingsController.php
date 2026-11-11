<?php

declare(strict_types=1);

namespace App\Http\Controllers\Settings;

use App\Enums\PermissionEnum;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Settings\Concerns\LogsProjectSettingsUpdateTrait;
use App\Http\Requests\Concerns\AuthorizesWithPermissionTrait;
use App\Http\Requests\Settings\UpdateAiToolSettingsRequest;
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
        ]);
    }

    /**
     * Persist the enabled mutating tools; the request checks the settings permission before validating.
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

        return redirect()
            ->route('ai-tools.edit')
            ->with('success', __('AI write tool settings saved.'));
    }
}
