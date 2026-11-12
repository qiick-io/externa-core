<?php

declare(strict_types=1);

namespace App\Services\Ai;

use App\Ai\Agents\ItemDraftWriter;
use App\Data\Ai\ItemDraftPromptData;
use App\Data\Ai\ItemDraftResultData;
use App\Enums\FieldTypeEnum;
use App\Enums\PermissionEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Collections\CollectionItemDataRuleBuilderService;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Schema-aware AI drafts for collection items (#210).
 *
 * Builds a structured-output schema from the collection's text-like fields the user may write,
 * prompts {@see ItemDraftWriter}, then validates every proposed value against the same field
 * rules an item save uses. Invalid values are dropped and reported, never repaired. Nothing is
 * persisted: the editor fills the unsaved form and saves through the normal item endpoints.
 */
class ItemDraftGeneratorService
{
    /** Field types whose values are plain strings the model can write. */
    private const array STRING_FIELD_TYPES = [
        FieldTypeEnum::String,
        FieldTypeEnum::Textarea,
        FieldTypeEnum::Wysiwyg,
        FieldTypeEnum::Markdown,
        FieldTypeEnum::Autocomplete,
        FieldTypeEnum::Select,
        FieldTypeEnum::RadioGroup,
    ];

    /** Field types stored as a list of strings. */
    private const array LIST_FIELD_TYPES = [
        FieldTypeEnum::Tag,
        FieldTypeEnum::Multiselect,
        FieldTypeEnum::CheckboxGroup,
    ];

    public function __construct(
        private EffectivePermissionResolverService $permissionResolver,
        private CollectionItemDataRuleBuilderService $ruleBuilder,
    ) {}

    public function isEnabled(): bool
    {
        return (bool) config('ai.item_drafts.enabled', false);
    }

    /**
     * Whether the item editor should offer AI drafts: feature on, the dedicated permission, and
     * the collection's create or update ability (the same checks the endpoint enforces).
     */
    public function canDraftFor(?User $user, Collection $collection): bool
    {
        if (! $user instanceof User || ! $this->isEnabled()) {
            return false;
        }

        if (! $this->permissionResolver->hasPermission($user, PermissionEnum::CanUseAiItemDrafts->value)) {
            return false;
        }

        $gate = Gate::forUser($user);

        return $gate->allows('createItems', $collection) || $gate->allows('updateItems', $collection);
    }

    /**
     * Prompt the model and return the validated draft.
     *
     * Side effects: one AI provider call and one `ai` activity log entry (no prompt or generated
     * content is logged: collections have no privacy flag, so content is treated as private).
     *
     * @throws ValidationException when the collection has no field an AI draft can fill
     */
    public function generate(Collection $collection, ItemDraftPromptData $input): ItemDraftResultData
    {
        $collection->loadMissing('fields');
        $draftableFields = $this->draftableFields($collection, $input->fieldGrants);

        if ($draftableFields->isEmpty()) {
            throw ValidationException::withMessages([
                'prompt' => __('This collection has no fields an AI draft can fill.'),
            ]);
        }

        // Skip in Pest: set_time_limit caps the whole PHPUnit process and kills the suite.
        if (! app()->runningUnitTests()) {
            set_time_limit(320);
        }

        $configuredModel = config('ai.item_drafts.model');
        $agent = new ItemDraftWriter(
            fn (JsonSchema $schema): array => $this->schemaFor($draftableFields, $schema, $input->locale),
            (int) config('ai.item_drafts.max_tokens', 0),
        );

        $response = $agent->prompt(
            $this->promptFor($collection, $input),
            model: is_string($configuredModel) && $configuredModel !== '' ? $configuredModel : null,
        );

        [$acceptedValues, $droppedFields] = $this->validatedDraft(
            $collection,
            $draftableFields,
            $response->toArray(),
            $input->locale,
        );
        $result = new ItemDraftResultData($acceptedValues, $droppedFields, $response->meta->model);

        $this->logUsage($collection, $input, $result);

        return $result;
    }

    /**
     * Text-like, visible, non-readonly fields the user may write (field ACL create or update).
     *
     * @param  array<string, array{read: bool, create: bool, update: bool}>|null  $fieldGrants
     * @return SupportCollection<int, CollectionField>
     */
    private function draftableFields(Collection $collection, ?array $fieldGrants): SupportCollection
    {
        return $collection->fields
            ->filter(function (CollectionField $field) use ($fieldGrants): bool {
                if ($field->isHiddenInForm() || $field->isReadonly() || ! $this->isDraftableType($field)) {
                    return false;
                }

                if ($fieldGrants === null) {
                    return true;
                }

                $grant = $fieldGrants[$field->name] ?? null;

                return is_array($grant)
                    && ($grant['read'] ?? false)
                    && (($grant['create'] ?? false) || ($grant['update'] ?? false));
            })
            ->values();
    }

    private function isDraftableType(CollectionField $field): bool
    {
        if (in_array($field->type, self::LIST_FIELD_TYPES, true)) {
            return true;
        }

        if (! in_array($field->type, self::STRING_FIELD_TYPES, true)) {
            return false;
        }

        // Numeric / UUID string inputs are identifiers, not prose.
        $inputType = (string) data_get($field->settings, 'input_type', 'string');

        return $field->type !== FieldTypeEnum::String || $inputType === 'string';
    }

    /**
     * @param  SupportCollection<int, CollectionField>  $fields
     * @return array<string, Type>
     */
    private function schemaFor(SupportCollection $fields, JsonSchema $schema, string $locale): array
    {
        $properties = [];

        foreach ($fields as $field) {
            $allowedValues = $this->allowedOptionValues($field);
            $description = $this->describeField($field, $locale);

            if (in_array($field->type, self::LIST_FIELD_TYPES, true)) {
                $itemType = $allowedValues !== [] ? $schema->string()->enum($allowedValues) : $schema->string()->max(1024);
                $properties[$field->name] = $schema->array()->items($itemType)->description($description);

                continue;
            }

            $type = $schema->string()->description($description);

            if ($allowedValues !== []) {
                $type->enum($allowedValues);
            }

            $maxLength = data_get($field->settings, 'max_length');

            if (is_numeric($maxLength) && (int) $maxLength > 0) {
                $type->max((int) $maxLength);
            }

            $properties[$field->name] = $type;
        }

        return $properties;
    }

    /**
     * Option values the field accepts, or [] when it takes free text (no options or allow_other).
     *
     * @return list<string>
     */
    private function allowedOptionValues(CollectionField $field): array
    {
        if ($field->type === FieldTypeEnum::Tag
            || CollectionField::settingsFlagIsEnabled(data_get($field->settings, 'allow_other', false))) {
            return [];
        }

        $options = data_get($field->settings, 'options', []);

        if (! is_array($options)) {
            return [];
        }

        $values = [];

        foreach ($options as $option) {
            if (is_array($option) && isset($option['value']) && (string) $option['value'] !== '') {
                $values[] = (string) $option['value'];
            }
        }

        return $values;
    }

    private function describeField(CollectionField $field, string $locale): string
    {
        $format = match ($field->type) {
            FieldTypeEnum::Wysiwyg => 'HTML fragment',
            FieldTypeEnum::Markdown => 'Markdown',
            FieldTypeEnum::Textarea => 'plain text, may span paragraphs',
            FieldTypeEnum::Tag => 'list of short tags',
            FieldTypeEnum::Multiselect, FieldTypeEnum::CheckboxGroup => 'list of allowed values',
            default => 'plain text',
        };

        $note = $field->note($locale);

        return trim(sprintf('%s (%s).%s', $field->displayName($locale), $format, $note !== null ? ' '.$note : ''));
    }

    private function promptFor(Collection $collection, ItemDraftPromptData $input): string
    {
        return sprintf(
            "Collection: %s\nLocale: %s\n\nBrief:\n%s",
            $collection->name,
            $input->locale,
            $input->prompt,
        );
    }

    /**
     * Keep each proposed value only when it passes the field's own item rules.
     *
     * Translatable fields are validated as `{locale: value}`, the shape an item save sends.
     *
     * @param  SupportCollection<int, CollectionField>  $fields
     * @param  array<mixed>  $structured
     * @return array{0: array<string, string|list<string>>, 1: list<array{field: string, reason: string}>}
     */
    private function validatedDraft(Collection $collection, SupportCollection $fields, array $structured, string $locale): array
    {
        $proposedValues = [];
        $droppedFields = [];

        foreach ($fields as $field) {
            $rawValue = $structured[$field->name] ?? null;

            if ($this->isEmptyValue($rawValue)) {
                continue;
            }

            $value = $this->normalizeValue($field, $rawValue);

            if ($value === null) {
                $droppedFields[] = ['field' => $field->name, 'reason' => __('The value has the wrong type for this field.')];

                continue;
            }

            $proposedValues[$field->name] = $value;
        }

        $payload = [];

        foreach ($fields as $field) {
            if (array_key_exists($field->name, $proposedValues)) {
                $payload[$field->name] = $field->translatable
                    ? [$locale => $proposedValues[$field->name]]
                    : $proposedValues[$field->name];
            }
        }

        $rules = $this->ruleBuilder->rules($collection, false, null, $payload);
        $acceptedValues = [];

        foreach ($proposedValues as $fieldName => $value) {
            $prefix = 'data.'.$fieldName;
            $fieldRules = array_filter(
                $rules,
                fn (string $key): bool => $key === $prefix || str_starts_with($key, $prefix.'.'),
                ARRAY_FILTER_USE_KEY,
            );
            $validator = Validator::make(['data' => [$fieldName => $payload[$fieldName]]], $fieldRules);

            if ($validator->fails()) {
                $droppedFields[] = ['field' => $fieldName, 'reason' => (string) $validator->errors()->first()];

                continue;
            }

            $acceptedValues[$fieldName] = $value;
        }

        return [$acceptedValues, $droppedFields];
    }

    /**
     * A value the model left blank: the field is simply not part of the draft.
     */
    private function isEmptyValue(mixed $value): bool
    {
        return $value === null || $value === [] || (is_string($value) && trim($value) === '');
    }

    /**
     * Coerce a non-empty model value to the field's storage shape; null means the wrong type.
     *
     * @return string|list<string>|null
     */
    private function normalizeValue(CollectionField $field, mixed $value): string|array|null
    {
        if (in_array($field->type, self::LIST_FIELD_TYPES, true)) {
            if (! is_array($value) || ! array_is_list($value)) {
                return null;
            }

            $strings = array_values(array_filter(
                array_map(fn (mixed $entry): ?string => is_string($entry) ? trim($entry) : null, $value),
                fn (?string $entry): bool => $entry !== null && $entry !== '',
            ));

            return $strings === [] ? null : $strings;
        }

        return is_string($value) ? trim($value) : null;
    }

    /**
     * Record usage without any prompt text or generated content.
     */
    private function logUsage(Collection $collection, ItemDraftPromptData $input, ItemDraftResultData $result): void
    {
        activity()
            ->causedBy($input->user)
            ->performedOn($collection)
            ->useLog('ai')
            ->event('ai_item_draft')
            ->withProperties([
                'collection_id' => $collection->id,
                'locale' => $input->locale,
                'prompt_length' => mb_strlen($input->prompt),
                'model' => $result->model,
                'filled_fields' => array_keys($result->values),
                'dropped_fields' => array_column($result->droppedFields, 'field'),
            ])
            ->log('AI item draft');
    }
}
