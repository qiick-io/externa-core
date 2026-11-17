<?php

declare(strict_types=1);

use App\Services\Settings\SettingsRepositoryService;

/**
 * The #779 data migration rewrites stored English preset slugs to the Italian ones.
 */
function runThemePresetSlugMigration(): void
{
    $migration = require database_path('migrations/2026_11_17_152952_rename_theme_presets_to_italian_names.php');
    $migration->up();
}

function storeProjectAppearance(?int $scopeId, array $appearanceValues): void
{
    app(SettingsRepositoryService::class)->setMany(
        SettingsRepositoryService::SCOPE_PROJECT,
        'appearance',
        $appearanceValues,
        $scopeId,
    );
}

function storedThemePreset(?int $scopeId): mixed
{
    return app(SettingsRepositoryService::class)->get(
        SettingsRepositoryService::SCOPE_PROJECT,
        'appearance',
        'theme_preset',
        $scopeId,
    );
}

test('renamed presets map one-to-one to the italian slugs', function (string $oldSlug, string $newSlug) {
    storeProjectAppearance(null, ['theme_preset' => $oldSlug, 'project_color' => null]);

    runThemePresetSlugMigration();

    expect(storedThemePreset(null))->toBe($newSlug);
})->with([
    ['teal', 'ottanio'],
    ['indigo', 'indaco'],
    ['violet', 'ametista'],
    ['rose', 'robbia'],
    ['slate', 'ardesia'],
]);

test('the removed blue preset becomes the default ottanio', function () {
    storeProjectAppearance(null, ['theme_preset' => 'blue']);

    runThemePresetSlugMigration();

    expect(storedThemePreset(null))->toBe('ottanio');
});

test('a slug outside the new set becomes the default ottanio', function (mixed $unknownPreset) {
    storeProjectAppearance(null, ['theme_preset' => $unknownPreset]);

    runThemePresetSlugMigration();

    expect(storedThemePreset(null))->toBe('ottanio');
})->with(['neon', 'Teal', '', null]);

test('a slug already in the new set is kept', function () {
    storeProjectAppearance(null, ['theme_preset' => 'ardesia']);

    runThemePresetSlugMigration();

    expect(storedThemePreset(null))->toBe('ardesia');
});

test('projects with a custom brand hex keep their stored preset untouched', function () {
    storeProjectAppearance(1, ['theme_preset' => 'blue', 'project_color' => '#112233']);
    storeProjectAppearance(2, ['theme_preset' => 'rose', 'project_color' => null, 'project_color_dark' => '#38bdf8']);
    storeProjectAppearance(3, ['theme_preset' => 'rose', 'project_color' => null]);

    runThemePresetSlugMigration();

    expect(storedThemePreset(1))->toBe('blue')
        ->and(storedThemePreset(2))->toBe('rose')
        ->and(storedThemePreset(3))->toBe('robbia');
});
