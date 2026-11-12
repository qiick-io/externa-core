<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Settings\ProjectSettingsService;

/**
 * Reads the Content project settings: revision retention defaults and the
 * Live Preview URL template.
 *
 * Every value comes from the shared, memoized {@see ProjectSettingsService::raw()}.
 */
class ProjectContentSettingsService
{
    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    /**
     * Project-level Live Preview URL template (tokens allowed). Null = unset.
     */
    public function previewUrlDefault(): ?string
    {
        return $this->projectSettings->raw()['preview_url_default'];
    }

    /**
     * Project default max revision count (null = unlimited until a collection overrides).
     */
    public function revisionRetentionCount(): ?int
    {
        return $this->projectSettings->raw()['revision_retention_count'];
    }

    /**
     * Project default revision age in days (null = unlimited until a collection overrides).
     */
    public function revisionRetentionDays(): ?int
    {
        return $this->projectSettings->raw()['revision_retention_days'];
    }
}
