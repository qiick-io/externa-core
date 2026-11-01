<?php

declare(strict_types=1);

namespace App\Services\Ai;

use App\Services\Settings\SettingsRepositoryService;

/**
 * Kill switch + per-tool-class allowlist for write/destructive AI tools.
 *
 * Env `AI_WRITE_TOOLS` / `AI_TOOLS_WRITE_ENABLED` must be true, and the tool name
 * must appear in config `ai.tools.write_allow` and/or project setting `ai.write_tools`.
 * An empty allowlist denies every mutating tool (fresh-install safe).
 */
class AiToolWriteGateService
{
    public function __construct(
        private readonly SettingsRepositoryService $settings,
    ) {}

    /**
     * Master kill switch (default false).
     */
    public function isWriteEnabled(): bool
    {
        return (bool) config('ai.tools.write_enabled', false);
    }

    /**
     * Whether a mutating tool class may proceed to the approval path.
     */
    public function isToolWriteAllowed(string $toolName): bool
    {
        if (! $this->isWriteEnabled()) {
            return false;
        }

        return in_array($toolName, $this->enabledWriteToolNames(), true);
    }

    /**
     * Opt-in list of mutating tool class names (config ∪ project settings).
     *
     * @return list<string>
     */
    public function enabledWriteToolNames(): array
    {
        $fromConfig = $this->normalizedNameList(config('ai.tools.write_allow', []));
        $fromSettings = $this->normalizedNameList(
            $this->settings->get(
                SettingsRepositoryService::SCOPE_PROJECT,
                'ai',
                'write_tools',
                null,
                [],
            ),
        );

        return array_values(array_unique([...$fromConfig, ...$fromSettings]));
    }

    /**
     * Persist the project-scoped allowlist of write tool class names.
     *
     * @param  list<string>  $toolNames
     */
    public function setEnabledWriteToolNames(array $toolNames): void
    {
        $this->settings->set(
            SettingsRepositoryService::SCOPE_PROJECT,
            'ai',
            'write_tools',
            $this->normalizedNameList($toolNames),
        );
    }

    /**
     * @return list<string>
     */
    private function normalizedNameList(mixed $value): array
    {
        if (is_string($value)) {
            $value = explode(',', $value);
        }

        if (! is_array($value)) {
            return [];
        }

        $names = [];

        foreach ($value as $item) {
            if (! is_string($item)) {
                continue;
            }

            $trimmed = trim($item);

            if ($trimmed !== '') {
                $names[] = $trimmed;
            }
        }

        return array_values(array_unique($names));
    }
}
