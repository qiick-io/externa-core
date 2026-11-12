<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Collections\ContentLocaleCatalogService;
use App\Services\Settings\ProjectSettingsService;

/**
 * Reads the Localization project settings: admin UI language and CMS content locales.
 *
 * Every value comes from the shared, memoized {@see ProjectSettingsService::raw()}.
 */
class ProjectLocalizationSettingsService
{
    public function __construct(
        private readonly ProjectSettingsService $projectSettings,
    ) {}

    public function defaultLanguage(): string
    {
        return $this->projectSettings->raw()['default_language'];
    }

    /**
     * Ordered content locales enabled for CMS translations.
     *
     * @return list<string>
     */
    public function contentLocales(): array
    {
        return $this->projectSettings->raw()['content_locales'];
    }

    public function defaultContentLocale(): string
    {
        return $this->projectSettings->raw()['default_content_locale'];
    }

    /**
     * Ordered fallback chain for missing translations.
     *
     * @return list<string>
     */
    public function fallbackContentLocales(): array
    {
        return $this->projectSettings->raw()['fallback_content_locales'];
    }

    /**
     * Catalog metadata for enabled content locales (Inertia share / settings UI).
     *
     * @return list<array{code: string, name: string, flag: string}>
     */
    public function contentLocaleMeta(): array
    {
        return ContentLocaleCatalogService::metaFor($this->contentLocales());
    }
}
