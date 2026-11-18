<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Rewrite stored theme presets to the Italian slugs (#779).
 *
 * The preset is not a column: it is the `appearance.theme_preset` row of the
 * project settings. Installs from 1.4.0 and earlier hold the old English slugs,
 * and a dead slug would resurface on export and in support even though
 * ThemePresetEnum::tryFromNullable() falls back to the default at read time.
 *
 * - the five renamed presets map one-to-one;
 * - `blue` (Excubia's brand colour, no longer an option) and any other value
 *   outside the new set become the default, `ottanio`;
 * - projects with a custom brand hex are left alone: a custom `--brand-primary`
 *   always wins over the preset, so rewriting their row would silently change a
 *   setting they are not using.
 *
 * The slugs are copied here rather than read from ThemePresetEnum so this
 * migration keeps its meaning when the enum changes later.
 */
return new class extends Migration
{
    private const DEFAULT_PRESET = 'ottanio';

    /**
     * @var array<string, string>
     */
    private const RENAMED_PRESETS = [
        'teal' => 'ottanio',
        'indigo' => 'indaco',
        'violet' => 'ametista',
        'rose' => 'robbia',
        'slate' => 'ardesia',
    ];

    /**
     * @var list<string>
     */
    private const CURRENT_PRESETS = ['ottanio', 'indaco', 'ametista', 'robbia', 'ardesia'];

    public function up(): void
    {
        $themePresetRows = DB::table('settings')
            ->where('scope', 'project')
            ->where('group', 'appearance')
            ->where('key', 'theme_preset')
            ->get(['id', 'scope_id', 'value']);

        foreach ($themePresetRows as $themePresetRow) {
            $scopeId = $themePresetRow->scope_id === null ? null : (int) $themePresetRow->scope_id;

            if ($this->hasCustomBrandColor($scopeId)) {
                continue;
            }

            $storedPreset = $this->decodedValue($themePresetRow->value);
            $rewrittenPreset = $this->rewrittenPreset($storedPreset);

            if ($rewrittenPreset === $storedPreset) {
                continue;
            }

            DB::table('settings')
                ->where('id', $themePresetRow->id)
                ->update(['value' => json_encode($rewrittenPreset), 'updated_at' => now()]);
        }
    }

    /**
     * Data-only migration: the old slugs no longer exist, nothing to restore.
     */
    public function down(): void
    {
        //
    }

    private function rewrittenPreset(mixed $storedPreset): string
    {
        if (is_string($storedPreset) && isset(self::RENAMED_PRESETS[$storedPreset])) {
            return self::RENAMED_PRESETS[$storedPreset];
        }

        if (is_string($storedPreset) && in_array($storedPreset, self::CURRENT_PRESETS, true)) {
            return $storedPreset;
        }

        return self::DEFAULT_PRESET;
    }

    /**
     * Whether the project stores a light or dark custom brand hex.
     */
    private function hasCustomBrandColor(?int $scopeId): bool
    {
        $brandColorValues = DB::table('settings')
            ->where('scope', 'project')
            ->where('group', 'appearance')
            ->whereIn('key', ['project_color', 'project_color_dark'])
            ->when(
                $scopeId === null,
                fn ($query) => $query->whereNull('scope_id'),
                fn ($query) => $query->where('scope_id', $scopeId),
            )
            ->pluck('value');

        foreach ($brandColorValues as $brandColorValue) {
            $brandColor = $this->decodedValue($brandColorValue);

            if (is_string($brandColor) && $brandColor !== '') {
                return true;
            }
        }

        return false;
    }

    private function decodedValue(mixed $storedValue): mixed
    {
        return is_string($storedValue) ? json_decode($storedValue, true) : $storedValue;
    }
};
