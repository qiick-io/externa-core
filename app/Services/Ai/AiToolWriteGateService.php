<?php

declare(strict_types=1);

namespace App\Services\Ai;

use App\Services\Settings\SettingsRepositoryService;

/**
 * Kill switch, per-tool-class allowlist and destructive switch for mutating AI tools.
 *
 * Writes are on by default (#766): env `AI_TOOLS_WRITE_ENABLED` / `AI_WRITE_TOOLS` turns
 * them off. The allowlist is config `ai.tools.write_allow` together with the project
 * setting `ai.write_tools`; when neither is set, every write tool is allowed, and setting
 * either one narrows it to what is listed (an install that listed tools in 1.4.0 keeps
 * exactly that list). Destructive actions have their own switch, off by default.
 */
class AiToolWriteGateService
{
    public function __construct(
        private readonly SettingsRepositoryService $settings,
    ) {}

    /**
     * Master kill switch (default true).
     */
    public function isWriteEnabled(): bool
    {
        return (bool) config('ai.tools.write_enabled', true);
    }

    /**
     * Destructive switch (default false): deletes, emptying the trash, and security actions.
     */
    public function isDestructiveEnabled(): bool
    {
        return (bool) config('ai.tools.destructive_enabled', false);
    }

    /**
     * Whether a mutating tool class may run (or proceed to the approval path).
     */
    public function isToolWriteAllowed(string $toolName): bool
    {
        if (! $this->isWriteEnabled()) {
            return false;
        }

        return $this->isToolAllowlisted($toolName);
    }

    /**
     * Whether the allowlist lets this tool class through, ignoring the kill switch.
     */
    public function isToolAllowlisted(string $toolName): bool
    {
        $allowlist = $this->writeAllowlist();

        return $allowlist === null || in_array($toolName, $allowlist, true);
    }

    /**
     * Mutating tool class names allowed by config ∪ project settings, or null when neither
     * is set (every write tool). A saved empty setting with no config list allows none.
     *
     * @return list<string>|null
     */
    public function writeAllowlist(): ?array
    {
        $fromConfig = $this->normalizedNameList(config('ai.tools.write_allow', []));
        $storedSetting = $this->settings->get(
            SettingsRepositoryService::SCOPE_PROJECT,
            'ai',
            'write_tools',
        );

        if ($fromConfig === [] && $storedSetting === null) {
            return null;
        }

        return array_values(array_unique([...$fromConfig, ...$this->normalizedNameList($storedSetting)]));
    }

    /**
     * Persist the project-scoped allowlist of write tool class names; null stores "every
     * write tool", so tools added in a later release are allowed too.
     *
     * @param  list<string>|null  $toolNames
     */
    public function setEnabledWriteToolNames(?array $toolNames): void
    {
        $this->settings->set(
            SettingsRepositoryService::SCOPE_PROJECT,
            'ai',
            'write_tools',
            $toolNames === null ? null : $this->normalizedNameList($toolNames),
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
