<?php

namespace App\Support\Collections;

use App\Services\Settings\ProjectSettings;
use Illuminate\Http\Request;

/**
 * Resolves the active locale for collection reads and writes.
 */
class CollectionLocaleResolver
{
    public function __construct(
        private Request $request,
        private ProjectSettings $projectSettings,
    ) {}

    /**
     * Resolve the active locale for collection content from query, header, or settings.
     */
    public function resolve(?string $override = null): string
    {
        if ($override !== null && $this->isAllowed($override)) {
            return $override;
        }

        $query = $this->request->query('locale');
        if (is_string($query) && $this->isAllowed($query)) {
            return $query;
        }

        $accept = $this->request->header('Accept-Language');
        if (is_string($accept)) {
            $first = $this->parseFirstLanguage($accept);
            if ($first !== null && $this->isAllowed($first)) {
                return $first;
            }
        }

        $default = $this->projectSettings->defaultContentLocale();
        if ($this->isAllowed($default)) {
            return $default;
        }

        $appDefault = config('app.locale');
        if (is_string($appDefault) && $this->isAllowed($appDefault)) {
            return $appDefault;
        }

        $locales = $this->allowedLocales();

        return $locales[0] ?? 'en';
    }

    /**
     * Abort when an explicit locale query/override is present but not enabled.
     */
    public function assertRequestedLocaleAllowed(?string $override = null): void
    {
        $candidate = $override;
        if ($candidate === null) {
            $query = $this->request->query('locale');
            $candidate = is_string($query) && $query !== '' ? $query : null;
        }

        if ($candidate === null) {
            return;
        }

        if (! $this->isAllowed($candidate)) {
            abort(422, __('The locale :locale is not enabled for this project.', ['locale' => $candidate]));
        }
    }

    /**
     * Ordered list of locales to try when resolving a translation (fallback).
     *
     * @return list<string>
     */
    public function fallbackChain(string $preferred): array
    {
        $allowed = array_values(array_filter(
            $this->projectSettings->fallbackContentLocales(),
            fn (string $locale): bool => $this->isAllowed($locale)
        ));

        $chain = [$preferred];
        foreach ($allowed as $locale) {
            if (! in_array($locale, $chain, true)) {
                $chain[] = $locale;
            }
        }

        $appFallback = config('app.fallback_locale');
        if (is_string($appFallback) && $this->isAllowed($appFallback) && ! in_array($appFallback, $chain, true)) {
            $chain[] = $appFallback;
        }

        return $chain;
    }

    /**
     * Whether the locale is enabled for collection content.
     */
    public function isAllowed(string $locale): bool
    {
        return in_array($locale, $this->allowedLocales(), true);
    }

    /**
     * @return list<string>
     */
    public function allowedLocales(): array
    {
        return $this->projectSettings->contentLocales();
    }

    private function parseFirstLanguage(string $acceptLanguage): ?string
    {
        $parts = explode(',', $acceptLanguage);
        $first = trim(explode(';', $parts[0] ?? '')[0] ?? '');
        if ($first === '') {
            return null;
        }

        if (str_contains($first, '-')) {
            return strtolower(explode('-', $first)[0]);
        }

        return strtolower($first);
    }
}
