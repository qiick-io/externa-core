<?php

namespace App\Enums;

/**
 * Built-in project appearance theme presets, named after Italian pigments and stones.
 *
 * Ottanio is Externa's own colour and the default. The picker offers generic presets
 * only: a sibling qiick product's brand colour is never an option here (#779).
 *
 * @see https://github.com/qiick-io/externa-core/issues/243
 * @see https://github.com/qiick-io/externa-core/issues/779
 */
enum ThemePresetEnum: string
{
    case Ottanio = 'ottanio';
    case Indaco = 'indaco';
    case Ametista = 'ametista';
    case Robbia = 'robbia';
    case Ardesia = 'ardesia';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public static function default(): self
    {
        return self::Ottanio;
    }

    public static function tryFromNullable(?string $value): self
    {
        if ($value === null || $value === '') {
            return self::default();
        }

        return self::tryFrom($value) ?? self::default();
    }
}
