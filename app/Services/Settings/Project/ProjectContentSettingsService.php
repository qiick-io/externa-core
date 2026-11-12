<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Settings\ProjectSettingsService;
use App\Traits\NormalizesProjectSettingValuesTrait;

/**
 * Reads the Content project settings: revision retention defaults and the
 * Live Preview URL template.
 *
 * Every value comes from the shared, memoized {@see ProjectSettingsService::raw()}.
 *
 * This area's keys of the stored bag are normalized here ({@see normalize()}),
 * and {@see ProjectSettingsService::raw()} composes them with the other areas.
 */
class ProjectContentSettingsService
{
    use NormalizesProjectSettingValuesTrait;

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

    /**
     * Normalize the Content keys (Live Preview template, revision retention) of a
     * stored `project` bag.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public function normalize(array $raw): array
    {
        return [
            'preview_url_default' => $this->nullablePreviewTemplate($raw['preview_url_default'] ?? null),
            'revision_retention_count' => $this->nullablePositiveInt(
                $raw['revision_retention_count'] ?? null,
                1,
                10000,
            ),
            'revision_retention_days' => $this->nullablePositiveInt(
                $raw['revision_retention_days'] ?? null,
                1,
                3650,
            ),
        ];
    }

    /**
     * HTTP(S) URL template that may contain `{{token}}` placeholders.
     */
    private function nullablePreviewTemplate(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        $trimmed = trim($value);
        if (! preg_match('/^https?:\/\/.+/i', $trimmed)) {
            return null;
        }

        return $trimmed;
    }
}
