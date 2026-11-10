<?php

use App\Services\Settings\ThemePresetService;

/**
 * resources/css/app.css carries fallback theme tokens (used before or without the
 * server-rendered preset <style>). They must equal the default Teal preset that
 * ThemePresetService renders, so config/theme-presets.php stays the one source.
 */

/**
 * Resolve an app.css value to a hex: palette vars, `var(--brand-…, fallback)`
 * (brand unset → fallback) and references to other tokens of the same block.
 *
 * @param  array<string, string>  $block
 * @param  array<string, string>  $palette
 */
function resolveAppCssValue(string $value, array $block, array $palette, int $depth = 0): string
{
    $value = trim($value);

    if ($depth > 6 || ! preg_match('/^var\(\s*--([a-z0-9-]+)\s*(?:,\s*(.+))?\)$/s', $value, $match)) {
        return strtoupper($value);
    }

    [$name, $fallback] = [$match[1], $match[2] ?? null];

    if (str_starts_with($name, 'color-')) {
        return $palette[$name] ?? "?{$name}";
    }

    if (! str_starts_with($name, 'brand-') && isset($block[$name])) {
        return resolveAppCssValue($block[$name], $block, $palette, $depth + 1);
    }

    return $fallback !== null ? resolveAppCssValue($fallback, $block, $palette, $depth + 1) : "?{$name}";
}

/**
 * @return array<string, string>
 */
function appCssBlock(string $css, string $selector): array
{
    preg_match('/^'.preg_quote($selector, '/').'\s*\{(.*?)\n\}/ms', $css, $match);
    preg_match_all('/--([a-z0-9-]+):\s*([^;]+);/', $match[1] ?? '', $pairs, PREG_SET_ORDER);

    return collect($pairs)->mapWithKeys(fn (array $pair): array => [$pair[1] => $pair[2]])->all();
}

test('app.css fallback tokens match the default Teal preset', function () {
    $css = file_get_contents(resource_path('css/app.css'));
    preg_match_all('/--(color-[a-z]+-\d+):\s*(#[0-9a-fA-F]{6})/', $css, $paletteMatches, PREG_SET_ORDER);
    $palette = collect($paletteMatches)->mapWithKeys(fn (array $pair): array => [$pair[1] => strtoupper($pair[2])])->all();
    $resolved = app(ThemePresetService::class)->resolve('teal', null, null);

    foreach (['light' => ':root', 'dark' => '.dark'] as $mode => $selector) {
        $block = appCssBlock($css, $selector);

        foreach ($resolved[$mode] as $token => $expected) {
            expect(isset($block[$token]))->toBeTrue("app.css {$selector} is missing --{$token}");
            expect(resolveAppCssValue($block[$token], $block, $palette))
                ->toBe(strtoupper($expected), "app.css {$selector} --{$token} differs from config");
        }
    }
});
