<?php

use App\Services\Css\OklchHueService;
use App\Services\Settings\ThemePresetService;

test('catalog lists the six built-in theme presets', function () {
    $catalog = app(ThemePresetService::class)->catalog();

    expect($catalog)->toHaveCount(6)
        ->and(collect($catalog)->pluck('slug')->all())
        ->toBe(['teal', 'blue', 'indigo', 'violet', 'rose', 'slate']);
});

test('unset preset resolves to teal tokens without brand overrides', function () {
    $resolved = app(ThemePresetService::class)->resolve(null, null, null);

    expect($resolved['themePreset'])->toBe('teal')
        ->and($resolved['brandPrimary'])->toBeNull()
        ->and($resolved['aiOverrideApplied'])->toBeFalse()
        ->and($resolved['light']['primary'])->toBe('#0E7C86')
        ->and($resolved['dark']['primary'])->toBe('#2CB1BC')
        ->and($resolved['light']['chart-3'])->toBe('#A85C0B')
        ->and($resolved['light']['ai'])->toBe('#7F35BB');
});

test('custom brand hex strips brand-linked preset keys and keeps other tokens', function () {
    $resolved = app(ThemePresetService::class)->resolve('indigo', '#112233', '#38bdf8');

    expect($resolved['themePreset'])->toBe('indigo')
        ->and($resolved['brandPrimary'])->toBe('#112233')
        ->and($resolved['brandPrimaryDark'])->toBe('#38bdf8')
        ->and($resolved['light'])->not->toHaveKey('primary')
        ->and($resolved['dark'])->not->toHaveKey('primary')
        ->and($resolved['light']['sidebar-accent'])->toBe('#F7F8FF')
        ->and($resolved['brandPrimaryForeground'])->toBe('#FFFFFF');
});

test('violet preset applies teal AI override tokens', function () {
    $resolved = app(ThemePresetService::class)->resolve('violet', null, null);

    expect($resolved['aiOverrideApplied'])->toBeTrue()
        ->and($resolved['light']['ai'])->toBe('#0E7C86')
        ->and($resolved['dark']['ai'])->toBe('#2CB1BC')
        ->and($resolved['light']['primary'])->toBe('#7E4BC0');
});

test('custom hex near AI accent hue triggers AI override', function () {
    $service = app(ThemePresetService::class);

    // #7F35BB is the AI accent violet (~306° OKLCH).
    expect($service->customHexNeedsAiOverride('#7F35BB'))->toBeTrue();

    $resolved = $service->resolve('teal', '#7F35BB', null);

    expect($resolved['aiOverrideApplied'])->toBeTrue()
        ->and($resolved['light']['ai'])->toBe('#0E7C86')
        ->and($resolved['brandPrimary'])->toBe('#7F35BB');
});

test('oklch hue distance treats violet brand as within thirty degrees of AI accent', function () {
    $hue = OklchHueService::fromHex('#7F35BB');

    expect($hue)->not->toBeNull()
        ->and(OklchHueService::distanceDegrees($hue, 306.0))->toBeLessThanOrEqual(30.0)
        ->and(OklchHueService::isWithinHue('#0E7C86', 306.0, 30.0))->toBeFalse();
});

test('every preset keeps the dark shell one step lighter than the content', function (string $slug) {
    $dark = app(ThemePresetService::class)->resolve($slug, null, null)['dark'];

    expect($dark['sidebar'])->toBe('#17232C')
        ->and($dark['sidebar'])->not->toBe($dark['background']);
})->with(['teal', 'blue', 'indigo', 'violet', 'rose', 'slate']);

test('presets only carry brand colours; surfaces live once in the shared base', function () {
    $base = config('theme-presets.base');

    foreach (config('theme-presets.presets') as $slug => $definition) {
        foreach (['light', 'dark'] as $mode) {
            expect(array_intersect_key($definition[$mode], $base[$mode]))
                ->toBe([], "{$slug}.{$mode} repeats base tokens");
        }
    }
});

test('the appearance catalog carries the same merged tokens the server applies', function () {
    $service = app(ThemePresetService::class);

    foreach ($service->catalog() as $preset) {
        $resolved = $service->resolve($preset['slug'], null, null);

        expect($preset['light'])->toBe($resolved['light'])
            ->and($preset['dark'])->toBe($resolved['dark']);
    }
});
