<?php

/**
 * The appearance page previews presets client-side from resources/js/lib/theme-presets.ts,
 * a mirror of config/theme-presets.php. Any drift shows up as the old colours while
 * editing appearance, so every name and token must match.
 */

/**
 * Hex tokens of one `light: { … }` / `dark: { … }` block in the TS mirror.
 *
 * @return array<string, string>
 */
function themeMirrorTokens(string $presetBlock, string $mode): array
{
    if (! preg_match('/\b'.$mode.':\s*\{(.*?)\n\s{8}\}/s', $presetBlock, $match)) {
        return [];
    }

    preg_match_all("/'?([a-z0-9-]+)'?:\s*'(#[0-9A-Fa-f]{6})'/", $match[1], $pairs, PREG_SET_ORDER);

    return collect($pairs)->mapWithKeys(fn (array $pair): array => [$pair[1] => strtoupper($pair[2])])->all();
}

test('the TS theme preset mirror matches config/theme-presets.php', function () {
    $mirror = file_get_contents(resource_path('js/lib/theme-presets.ts'));

    foreach (config('theme-presets.presets') as $slug => $definition) {
        expect(preg_match("/slug: '{$slug}',(.*?)\n    \},/s", $mirror, $block))->toBe(1, "missing preset {$slug}");

        expect($block[1])->toContain("name: '{$definition['name']}'");

        foreach (['light', 'dark'] as $mode) {
            $expected = collect($definition[$mode])->map(fn (string $value): string => strtoupper($value))->all();

            expect(themeMirrorTokens($block[1], $mode))->toEqual($expected, "{$slug}.{$mode} drifted");
        }
    }
});
