<?php

namespace App\Support\Collections;

use Illuminate\Http\Request;

/**
 * Resolves the active locale for collection reads and writes.
 */
class CollectionLocaleResolver
{
    public function __construct(
        private Request $request,
    ) {}

    /**
     * Resolve the active locale for collection content from query, header, or config.
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

        $default = config('app.locale');
        if (is_string($default) && $this->isAllowed($default)) {
            return $default;
        }

        $locales = config('collections.locales', ['en']);

        return is_array($locales) && $locales !== [] ? (string) $locales[0] : 'en';
    }

    /**
     * Ordered list of locales to try when resolving a translation (fallback).
     *
     * @return list<string>
     */
    public function fallbackChain(string $preferred): array
    {
        $allowed = array_values(array_filter(
            config('collections.fallback_locales', []),
            fn (mixed $locale): bool => is_string($locale) && $this->isAllowed($locale)
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
     * Whether the locale is configured as allowed for collections.
     */
    public function isAllowed(string $locale): bool
    {
        $locales = config('collections.locales', []);

        return is_array($locales) && in_array($locale, $locales, true);
    }

    /**
     * @return list<string>
     */
    public function allowedLocales(): array
    {
        $locales = config('collections.locales', []);

        return is_array($locales)
            ? array_values(array_filter($locales, fn (mixed $locale): bool => is_string($locale)))
            : [];
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
