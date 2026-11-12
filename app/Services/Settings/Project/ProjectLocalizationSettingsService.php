<?php

declare(strict_types=1);

namespace App\Services\Settings\Project;

use App\Services\Collections\ContentLocaleCatalogService;
use App\Services\Settings\ProjectSettingsService;

/**
 * Reads the Localization project settings: admin UI language and CMS content locales.
 *
 * Every value comes from the shared, memoized {@see ProjectSettingsService::raw()}.
 *
 * This area's keys of the stored bag are normalized here ({@see normalize()}),
 * and {@see ProjectSettingsService::raw()} composes them with the other areas.
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

    /**
     * Normalize the Localization keys of a stored `project` bag.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public function normalize(array $raw): array
    {
        $locales = array_keys(config('i18n.available_locales', ['en' => 'English']));
        $language = is_string($raw['default_language'] ?? null) ? $raw['default_language'] : 'en';
        if (! in_array($language, $locales, true)) {
            $language = 'en';
        }

        return [
            'default_language' => $language,
            ...$this->normalizeContentLocales(
                $raw['content_locales'] ?? null,
                $raw['default_content_locale'] ?? null,
                $raw['fallback_content_locales'] ?? null,
            ),
        ];
    }

    /**
     * @return array{
     *     content_locales: list<string>,
     *     default_content_locale: string,
     *     fallback_content_locales: list<string>
     * }
     */
    private function normalizeContentLocales(
        mixed $locales,
        mixed $default,
        mixed $fallbacks,
    ): array {
        $seedLocales = $this->configLocaleList('collections.locales', ['en', 'it']);
        $seedFallbacks = $this->configLocaleList('collections.fallback_locales', $seedLocales);

        $normalized = [];
        if (is_array($locales)) {
            foreach ($locales as $locale) {
                if (! is_string($locale)) {
                    continue;
                }
                $code = trim($locale);
                if ($code === '' || isset($normalized[$code])) {
                    continue;
                }
                // Allow catalog codes and any already-seeded/config codes
                if (! ContentLocaleCatalogService::isKnown($code) && ! in_array($code, $seedLocales, true)) {
                    continue;
                }
                $normalized[$code] = $code;
            }
        }

        $contentLocales = array_values($normalized);
        if ($contentLocales === []) {
            $contentLocales = $seedLocales !== [] ? $seedLocales : ['en'];
        }

        $defaultLocale = is_string($default) && trim($default) !== '' ? trim($default) : null;
        if ($defaultLocale === null || ! in_array($defaultLocale, $contentLocales, true)) {
            $defaultLocale = $contentLocales[0];
        }

        $fallbackList = [];
        if (is_array($fallbacks)) {
            foreach ($fallbacks as $locale) {
                if (! is_string($locale)) {
                    continue;
                }
                $code = trim($locale);
                if ($code === '' || ! in_array($code, $contentLocales, true) || in_array($code, $fallbackList, true)) {
                    continue;
                }
                $fallbackList[] = $code;
            }
        }

        if ($fallbackList === []) {
            // default + remaining content locales in order (seed fallbacks preferred when matching)
            $fallbackList = [$defaultLocale];
            foreach ($seedFallbacks as $locale) {
                if (in_array($locale, $contentLocales, true) && ! in_array($locale, $fallbackList, true)) {
                    $fallbackList[] = $locale;
                }
            }
            foreach ($contentLocales as $locale) {
                if (! in_array($locale, $fallbackList, true)) {
                    $fallbackList[] = $locale;
                }
            }
        }

        return [
            'content_locales' => $contentLocales,
            'default_content_locale' => $defaultLocale,
            'fallback_content_locales' => $fallbackList,
        ];
    }

    /**
     * @param  list<string>  $fallback
     * @return list<string>
     */
    private function configLocaleList(string $key, array $fallback): array
    {
        $locales = config($key, $fallback);

        if (! is_array($locales)) {
            return $fallback;
        }

        return array_values(array_filter($locales, fn (mixed $locale): bool => is_string($locale) && $locale !== ''));
    }
}
