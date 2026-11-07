/**
 * Theme preset types. The presets themselves live only in
 * config/theme-presets.php and reach the appearance page through the
 * `theme_presets` payload (base surfaces merged with brand colours).
 *
 * @see https://github.com/qiick-io/externa-core/issues/243
 */

export type { ThemePresetSlug } from '@/types/appearance';

export type ThemePresetTokens = Record<string, string>;
