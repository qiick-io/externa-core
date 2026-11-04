<?php

namespace App\Enums;

/**
 * Built-in project appearance theme presets.
 *
 * @see https://github.com/qiick-io/externa-core/issues/243
 */
enum ThemePresetEnum: string
{
    case Teal = 'teal';
    case Blue = 'blue';
    case Indigo = 'indigo';
    case Violet = 'violet';
    case Rose = 'rose';
    case Slate = 'slate';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public static function default(): self
    {
        return self::Teal;
    }

    public static function tryFromNullable(?string $value): self
    {
        if ($value === null || $value === '') {
            return self::default();
        }

        return self::tryFrom($value) ?? self::default();
    }
}
