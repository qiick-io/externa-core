<?php

namespace App\Enums;

/**
 * Collection field type identifiers and storage helpers.
 */
enum FieldTypeEnum: string
{
    case String = 'string';
    case Autocomplete = 'autocomplete';
    case ApiAutocomplete = 'api_autocomplete';
    case Number = 'number';
    case Boolean = 'boolean';
    case Textarea = 'textarea';
    case Wysiwyg = 'wysiwyg';
    case Markdown = 'markdown';
    case Code = 'code';
    case Select = 'select';
    case Multiselect = 'multiselect';
    case CheckboxGroup = 'checkbox_group';
    case CheckboxGroupTree = 'checkbox_group_tree';
    case RadioGroup = 'radio_group';
    case Date = 'date';
    case Map = 'map';
    case Color = 'color';
    case Tag = 'tag';
    case Image = 'image';
    case File = 'file';
    case Files = 'files';
    case Relation = 'relation';
    case ManyToOne = 'many_to_one';
    case OneToMany = 'one_to_many';
    case ManyToMany = 'many_to_many';
    case M2a = 'm2a';
    case RelationTree = 'relation_tree';
    case RelationMany = 'relation_many';
    case Hash = 'hash';
    case Slider = 'slider';

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
            self::Multiselect,
            self::CheckboxGroup,
            self::CheckboxGroupTree,
            self::Tag,
            self::Files,
            self::OneToMany,
            self::ManyToMany,
            self::M2a,
            self::RelationMany => true,
            default => false,
        };
    }

    /**
     * Whether this field type stores a relation to another collection.
     */
    public function isRelationType(): bool
    {
        return match ($this) {
            self::Relation,
            self::ManyToOne,
            self::OneToMany,
            self::ManyToMany,
            self::RelationTree,
            self::RelationMany => true,
            default => false,
        };
    }

    /**
     * Whether this relation type stores multiple related item IDs.
     */
    public function isMultipleRelationType(): bool
    {
        return match ($this) {
            self::OneToMany,
            self::ManyToMany,
            self::RelationMany => true,
            default => false,
        };
    }

    /**
     * Whether editors may mark this field as per-locale (translatable).
     *
     * Hash fingerprints and relation IDs are shared across locales; enabling
     * the flag is useless / misleading for those types.
     */
    public function supportsTranslatable(): bool
    {
        return match ($this) {
            self::Hash,
            self::Relation,
            self::ManyToOne,
            self::OneToMany,
            self::ManyToMany,
            self::M2a,
            self::RelationTree,
            self::RelationMany => false,
            default => true,
        };
    }
}
