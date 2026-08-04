<?php

namespace Database\Seeders;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use Illuminate\Database\Seeder;

/**
 * Create a comprehensive test collection with all field types.
 */
class KitchenSinkCollectionSeeder extends Seeder
{
    public function run(): void
    {
        $collection = Collection::query()->updateOrCreate(
            ['slug' => 'kitchen-sink'],
            [
                'name' => 'Kitchen Sink - All Field Types',
                'is_singleton' => false,
            ]
        );

        $collection->fields()->delete();

        $fieldTypes = [
            FieldTypeEnum::String,
            FieldTypeEnum::Autocomplete,
            FieldTypeEnum::ApiAutocomplete,
            FieldTypeEnum::Number,
            FieldTypeEnum::Boolean,
            FieldTypeEnum::Textarea,
            FieldTypeEnum::Wysiwyg,
            FieldTypeEnum::Markdown,
            FieldTypeEnum::Code,
            FieldTypeEnum::Select,
            FieldTypeEnum::Multiselect,
            FieldTypeEnum::CheckboxGroup,
            FieldTypeEnum::CheckboxGroupTree,
            FieldTypeEnum::RadioGroup,
            FieldTypeEnum::Date,
            FieldTypeEnum::Map,
            FieldTypeEnum::Color,
            FieldTypeEnum::Tag,
            FieldTypeEnum::Image,
            FieldTypeEnum::File,
            FieldTypeEnum::Files,
            FieldTypeEnum::Relation,
            FieldTypeEnum::ManyToOne,
            FieldTypeEnum::OneToMany,
            FieldTypeEnum::ManyToMany,
            FieldTypeEnum::M2a,
            FieldTypeEnum::Blocks,
            FieldTypeEnum::RelationTree,
            FieldTypeEnum::RelationMany,
            FieldTypeEnum::Hash,
            FieldTypeEnum::Slider,
        ];

        $sortOrder = 1;
        foreach ($fieldTypes as $type) {
            $settings = match ($type) {
                FieldTypeEnum::Select, FieldTypeEnum::Multiselect, 
                FieldTypeEnum::CheckboxGroup, FieldTypeEnum::RadioGroup => [
                    'options' => [
                        ['value' => 'option1', 'label' => ['en' => 'Option 1']],
                        ['value' => 'option2', 'label' => ['en' => 'Option 2']],
                        ['value' => 'option3', 'label' => ['en' => 'Option 3']],
                    ],
                ],
                FieldTypeEnum::Relation, FieldTypeEnum::ManyToOne, 
                FieldTypeEnum::OneToMany, FieldTypeEnum::ManyToMany,
                FieldTypeEnum::RelationTree, FieldTypeEnum::RelationMany => [
                    'related_collection_id' => $collection->id,
                ],
                FieldTypeEnum::Slider => [
                    'min' => 0,
                    'max' => 100,
                    'step' => 1,
                ],
                FieldTypeEnum::Code => [
                    'language' => 'javascript',
                ],
                default => [],
            };

            CollectionField::create([
                'collection_id' => $collection->id,
                'name' => strtolower(str_replace(['_', '-'], '_', $type->value)),
                'type' => $type,
                'translatable' => $type->supportsTranslatable() ? false : false,
                'settings' => $settings,
                'sort_order' => $sortOrder++,
            ]);
        }
    }
}
