<?php

namespace App\Enums;

enum FieldTypeEnum: string
{
    case String = 'string';
    case Number = 'number';
    case Boolean = 'boolean';
    case Textarea = 'textarea';
    case Markdown = 'markdown';
    case Code = 'code';
    case Select = 'select';
    case Multiselect = 'multiselect';
    case RadioGroup = 'radio_group';
    case Date = 'date';
    case Color = 'color';
    case Tag = 'tag';
    case Image = 'image';
    case File = 'file';
    case Relation = 'relation';
    case RelationMany = 'relation_many';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * Types stored as array in JSON (non-translatable or per-locale array).
     */
    public function isArrayStorage(): bool
    {
        return match ($this) {
            self::Multiselect, self::Tag, self::RelationMany => true,
            default => false,
        };
    }
}
