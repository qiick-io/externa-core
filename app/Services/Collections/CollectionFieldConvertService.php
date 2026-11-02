<?php

declare(strict_types=1);

namespace App\Services\Collections;

use App\Data\Collections\FieldConvertOptionsData;
use App\Data\Collections\FieldConvertResultData;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Models\CollectionItem;
use App\Services\Settings\ProjectSettingsService;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

/**
 * Safe field type / translatable conversion with dry-run preview (#220).
 *
 * Converts published `collections_items_values` and `draft_data` for the field.
 * Historical revisions stay untouched snapshots; restore adapts or rejects via
 * {@see adaptSnapshotValue()}.
 */
class CollectionFieldConvertService
{
    public function __construct(
        private CollectionFieldConvertMatrixService $matrix,
        private CollectionItemValuesAssemblerService $assembler,
        private CollectionItemValuesWriterService $writer,
        private CollectionItemRevisionRecorderService $revisionRecorder,
        private CollectionLocaleResolver $localeResolver,
        private ProjectSettingsService $projectSettings,
    ) {}

    /**
     * @return list<string>
     */
    public function supportedTargetTypes(CollectionField $field): array
    {
        return $this->matrix->supportedTargetTypes($field->type);
    }

    /**
     * Preview or apply a conversion. Dry-run never writes.
     *
     * Apply aborts with no writes when any item value cannot be converted.
     */
    public function run(CollectionField $field, FieldConvertOptionsData $options): FieldConvertResultData
    {
        $field->loadMissing('collection.fields');
        $collection = $field->collection;
        if ($collection === null) {
            throw new InvalidArgumentException('Field has no collection.');
        }

        $fromType = $field->type;
        $fromTranslatable = (bool) $field->translatable;
        $toType = $options->toType;
        $toTranslatable = $options->toTranslatable;

        if (! $this->matrix->isSupported($fromType, $toType, $fromTranslatable, $toTranslatable)) {
            return $this->unsupportedResult($field, $options, $fromType, $fromTranslatable);
        }

        if ($toTranslatable === false && $fromTranslatable === true) {
            $locale = $options->locale ?? $this->defaultLocale();
            if (! $this->localeResolver->isAllowed($locale)) {
                return $this->errorResult(
                    $field,
                    $options,
                    $fromType,
                    $fromTranslatable,
                    __('Choose a project content locale to collapse translatable values.'),
                );
            }
        }

        $itemRows = [];
        $failed = 0;
        $ok = 0;
        $unchanged = 0;
        $skipped = 0;
        $withDraft = 0;

        $items = CollectionItem::withTrashed()
            ->where('collection_id', $collection->id)
            ->with(['fieldValues' => fn ($query) => $query->where('field_id', $field->id)])
            ->orderBy('id')
            ->get();

        $workingSettings = $this->mergeSettings($field, $options);
        $optionValues = $this->collectOptionValues($workingSettings);

        foreach ($items as $item) {
            $publishedBefore = $this->readPublishedValue($item, $field);
            $draftBefore = $this->readDraftValue($item, $field);
            $hasDraft = array_key_exists($field->name, is_array($item->draft_data) ? $item->draft_data : []);

            if ($hasDraft) {
                $withDraft++;
            }

            if ($publishedBefore === null && $draftBefore === null && ! $hasDraft) {
                $skipped++;
                $itemRows[] = $this->itemRow(
                    $item->id,
                    'skipped',
                    __('No stored value for this field.'),
                    $hasDraft,
                    $publishedBefore,
                    $publishedBefore,
                    $draftBefore,
                    $draftBefore,
                );

                continue;
            }

            $publishedResult = $this->convertValue(
                $publishedBefore,
                $fromType,
                $toType,
                $fromTranslatable,
                $toTranslatable,
                $options,
                $optionValues,
            );

            if (! $publishedResult['ok']) {
                $failed++;
                $itemRows[] = $this->itemRow(
                    $item->id,
                    'failed',
                    $publishedResult['reason'],
                    $hasDraft,
                    $publishedBefore,
                    null,
                    $draftBefore,
                    null,
                );

                continue;
            }

            $draftResult = ['ok' => true, 'value' => $draftBefore, 'reason' => null, 'created_options' => []];
            if ($hasDraft) {
                $draftResult = $this->convertValue(
                    $draftBefore,
                    $fromType,
                    $toType,
                    $fromTranslatable,
                    $toTranslatable,
                    $options,
                    $optionValues,
                );

                if (! $draftResult['ok']) {
                    $failed++;
                    $itemRows[] = $this->itemRow(
                        $item->id,
                        'failed',
                        $draftResult['reason'],
                        $hasDraft,
                        $publishedBefore,
                        $publishedResult['value'],
                        $draftBefore,
                        null,
                    );

                    continue;
                }
            }

            foreach ($publishedResult['created_options'] as $created) {
                $optionValues[$created] = true;
                $workingSettings = $this->appendOption($workingSettings, $created);
            }
            foreach ($draftResult['created_options'] as $created) {
                $optionValues[$created] = true;
                $workingSettings = $this->appendOption($workingSettings, $created);
            }

            $publishedAfter = $publishedResult['value'];
            $draftAfter = $hasDraft ? $draftResult['value'] : $draftBefore;
            $isUnchanged = $fromType === $toType
                && $fromTranslatable === $toTranslatable
                && $publishedBefore === $publishedAfter
                && $draftBefore === $draftAfter;

            if ($isUnchanged) {
                $unchanged++;
                $status = 'unchanged';
            } else {
                $ok++;
                $status = 'ok';
            }

            $itemRows[] = $this->itemRow(
                $item->id,
                $status,
                null,
                $hasDraft,
                $publishedBefore,
                $publishedAfter,
                $draftBefore,
                $draftAfter,
            );
        }

        $counts = [
            'ok' => $ok,
            'unchanged' => $unchanged,
            'failed' => $failed,
            'skipped' => $skipped,
            'with_draft' => $withDraft,
        ];

        if ($options->dryRun || $failed > 0) {
            return new FieldConvertResultData(
                supported: true,
                dryRun: $options->dryRun || $failed > 0,
                applied: false,
                fromType: $fromType->value,
                toType: $toType->value,
                fromTranslatable: $fromTranslatable,
                toTranslatable: $toTranslatable,
                items: $itemRows,
                counts: $counts,
                matrix: $this->matrix->documentedMatrix(),
                error: $failed > 0
                    ? __('Conversion aborted: :count value(s) cannot be converted. Nothing was written.', ['count' => $failed])
                    : null,
                fieldId: $field->id,
            );
        }

        $this->applyConversion($collection, $field, $options, $itemRows, $workingSettings);

        activity()
            ->performedOn($field)
            ->withProperties([
                'from_type' => $fromType->value,
                'to_type' => $toType->value,
                'from_translatable' => $fromTranslatable,
                'to_translatable' => $toTranslatable,
                'counts' => $counts,
            ])
            ->log('field.convert');

        return new FieldConvertResultData(
            supported: true,
            dryRun: false,
            applied: true,
            fromType: $fromType->value,
            toType: $toType->value,
            fromTranslatable: $fromTranslatable,
            toTranslatable: $toTranslatable,
            items: $itemRows,
            counts: $counts,
            matrix: $this->matrix->documentedMatrix(),
            fieldId: $field->id,
        );
    }

    /**
     * Map a single snapshot value (e.g. revision restore) onto the field's current type.
     *
     * @throws ValidationException when the value cannot be adapted
     */
    public function adaptSnapshotValue(CollectionField $field, mixed $value): mixed
    {
        // Revision snapshots are historical — treat stored shape as "best effort" text/select family.
        $guessedFrom = $this->guessSnapshotType($field, $value);

        if ($guessedFrom === $field->type && $this->snapshotMatchesTranslatable($field, $value)) {
            return $value;
        }

        $options = new FieldConvertOptionsData(
            toType: $field->type,
            toTranslatable: (bool) $field->translatable,
            locale: $this->defaultLocale(),
            createMissingOptions: false,
            dryRun: true,
        );

        if (! $this->matrix->isSupported($guessedFrom, $field->type, $this->valueLooksTranslatable($value), (bool) $field->translatable)) {
            throw ValidationException::withMessages([
                $field->name => [__('Cannot restore this revision: field :field was converted and the snapshot value is not compatible with the current type (:type).', [
                    'field' => $field->name,
                    'type' => $field->type->value,
                ])],
            ]);
        }

        $optionValues = $this->collectOptionValues($field->settings ?? []);
        $result = $this->convertValue(
            $value,
            $guessedFrom,
            $field->type,
            $this->valueLooksTranslatable($value),
            (bool) $field->translatable,
            $options,
            $optionValues,
        );

        if (! $result['ok']) {
            throw ValidationException::withMessages([
                $field->name => [$result['reason'] ?? __('Cannot restore this revision for field :field.', ['field' => $field->name])],
            ]);
        }

        return $result['value'];
    }

    /**
     * Adapt every field key in a revision/item snapshot to the current schema.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    public function adaptSnapshotData(Collection $collection, array $data): array
    {
        $collection->loadMissing('fields');
        $adapted = $data;

        foreach ($collection->fields as $field) {
            if ($field->type->isNoData() || ! array_key_exists($field->name, $adapted)) {
                continue;
            }

            $adapted[$field->name] = $this->adaptSnapshotValue($field, $adapted[$field->name]);
        }

        return $adapted;
    }

    /**
     * Assemble under the old schema, then flip the field definition and rewrite values.
     *
     * @param  list<array<string, mixed>>  $itemRows
     * @param  array<string, mixed>  $workingSettings
     */
    private function applyConversion(
        Collection $collection,
        CollectionField $field,
        FieldConvertOptionsData $options,
        array $itemRows,
        array $workingSettings,
    ): void {
        $chunkSize = max(1, $options->chunkSize);
        $fromType = $field->type->value;
        $fieldName = $field->name;
        $fieldId = (int) $field->id;

        $rowsById = [];
        foreach ($itemRows as $row) {
            $rowsById[(int) $row['item_id']] = $row;
        }

        DB::transaction(function () use (
            $collection,
            $field,
            $options,
            $rowsById,
            $workingSettings,
            $chunkSize,
            $fromType,
            $fieldName,
            $fieldId,
        ): void {
            /** @var list<array{item: CollectionItem, assembled: array<string, mixed>, draft: ?array<string, mixed>, touch_published: bool}> $plans */
            $plans = [];

            $itemIds = array_keys($rowsById);
            foreach (array_chunk($itemIds, $chunkSize) as $chunk) {
                $items = CollectionItem::withTrashed()
                    ->whereIn('id', $chunk)
                    ->with(['fieldValues', 'collection.fields'])
                    ->get();

                foreach ($items as $item) {
                    $row = $rowsById[(int) $item->id] ?? null;
                    if ($row === null || $row['status'] === 'skipped') {
                        continue;
                    }

                    $touchPublished = $row['status'] !== 'unchanged'
                        || $row['published_before'] !== $row['published_after']
                        || $row['has_draft'];

                    $assembled = $this->assembler->assemble($item);
                    $assembled[$fieldName] = $row['published_after'];

                    $draft = null;
                    if ($row['has_draft']) {
                        $draft = is_array($item->draft_data) ? $item->draft_data : [];
                        $draft[$fieldName] = $row['draft_after'];
                    }

                    $plans[] = [
                        'item' => $item,
                        'assembled' => $assembled,
                        'draft' => $draft,
                        'touch_published' => $touchPublished,
                    ];
                }
            }

            $field->update([
                'type' => $options->toType,
                'translatable' => $options->toTranslatable,
                'settings' => $workingSettings === [] ? null : $workingSettings,
            ]);

            $collection->unsetRelation('fields');
            $collection->load(['fields' => fn ($query) => $query->ordered()]);

            foreach ($plans as $plan) {
                if ($plan['touch_published']) {
                    $this->writer->sync(
                        $plan['item'],
                        $collection,
                        $plan['assembled'],
                        created: false,
                        revisionMeta: [
                            'source' => 'convert',
                            'field_id' => $fieldId,
                            'field' => $fieldName,
                            'from_type' => $fromType,
                            'to_type' => $options->toType->value,
                        ],
                    );
                }

                if ($plan['draft'] !== null) {
                    $plan['item']->draft_data = $plan['draft'];
                    $plan['item']->save();
                    $this->revisionRecorder->record($plan['item'], [
                        'source' => 'convert',
                        'version' => 'draft',
                        'field_id' => $fieldId,
                        'field' => $fieldName,
                        'from_type' => $fromType,
                        'to_type' => $options->toType->value,
                    ], $plan['draft']);
                }
            }
        });
    }

    /**
     * @param  array<string, true>  $optionValues
     * @return array{ok: bool, value: mixed, reason: ?string, created_options: list<string>}
     */
    private function convertValue(
        mixed $value,
        FieldTypeEnum $fromType,
        FieldTypeEnum $toType,
        bool $fromTranslatable,
        bool $toTranslatable,
        FieldConvertOptionsData $options,
        array $optionValues,
    ): array {
        if ($value === null) {
            return ['ok' => true, 'value' => null, 'reason' => null, 'created_options' => []];
        }

        $createdOptions = [];

        if ($fromTranslatable && is_array($value)) {
            $convertedLocales = [];
            foreach ($value as $locale => $localeValue) {
                $inner = $this->convertScalarOrFail(
                    $localeValue,
                    $fromType,
                    $toType,
                    $options,
                    $optionValues,
                    $createdOptions,
                );
                if ($inner === false) {
                    return [
                        'ok' => false,
                        'value' => null,
                        'reason' => __('Value for locale :locale cannot be converted to :type.', [
                            'locale' => (string) $locale,
                            'type' => $toType->value,
                        ]),
                        'created_options' => [],
                    ];
                }
                $convertedLocales[(string) $locale] = $inner;
            }
            $value = $convertedLocales;
        } else {
            $inner = $this->convertScalarOrFail(
                $value,
                $fromType,
                $toType,
                $options,
                $optionValues,
                $createdOptions,
            );
            if ($inner === false) {
                return [
                    'ok' => false,
                    'value' => null,
                    'reason' => __('Value cannot be converted to :type.', ['type' => $toType->value]),
                    'created_options' => [],
                ];
            }
            $value = $inner;
        }

        if ($fromTranslatable === $toTranslatable) {
            return ['ok' => true, 'value' => $value, 'reason' => null, 'created_options' => $createdOptions];
        }

        if (! $fromTranslatable && $toTranslatable) {
            $locale = $this->defaultLocale();

            return [
                'ok' => true,
                'value' => [$locale => $value],
                'reason' => null,
                'created_options' => $createdOptions,
            ];
        }

        // translatable → non-translatable
        if (! is_array($value)) {
            return ['ok' => true, 'value' => $value, 'reason' => null, 'created_options' => $createdOptions];
        }

        $locale = $options->locale ?? $this->defaultLocale();
        if (! array_key_exists($locale, $value)) {
            // Fall back to first locale with a non-null value.
            foreach ($value as $localeKey => $localeValue) {
                if ($localeValue !== null && $localeValue !== '') {
                    return [
                        'ok' => true,
                        'value' => $localeValue,
                        'reason' => null,
                        'created_options' => $createdOptions,
                    ];
                }
            }

            return ['ok' => true, 'value' => null, 'reason' => null, 'created_options' => $createdOptions];
        }

        return [
            'ok' => true,
            'value' => $value[$locale],
            'reason' => null,
            'created_options' => $createdOptions,
        ];
    }

    /**
     * @param  array<string, true>  $optionValues
     * @param  list<string>  $createdOptions
     */
    private function convertScalarOrFail(
        mixed $value,
        FieldTypeEnum $fromType,
        FieldTypeEnum $toType,
        FieldConvertOptionsData $options,
        array &$optionValues,
        array &$createdOptions,
    ): mixed {
        if ($value === null) {
            return null;
        }

        if ($fromType === $toType || ($this->matrix->isTextScalar($fromType) && $this->matrix->isTextScalar($toType))) {
            if (is_string($value) || is_int($value) || is_float($value) || is_bool($value)) {
                return is_string($value) ? $value : (string) $value;
            }

            // Already select-shaped string, or unexpected — reject non-scalars for text family.
            if ($this->matrix->isTextScalar($toType)) {
                return false;
            }
        }

        if ($fromType === FieldTypeEnum::String && $toType === FieldTypeEnum::Select) {
            if (! is_string($value) && ! is_int($value) && ! is_float($value) && ! is_bool($value)) {
                return false;
            }

            $asString = is_string($value) ? $value : (string) $value;
            $mapped = $options->optionMapping[$asString] ?? $asString;

            if (isset($optionValues[$mapped])) {
                return $mapped;
            }

            if ($options->createMissingOptions) {
                $createdOptions[] = $mapped;
                $optionValues[$mapped] = true;

                return $mapped;
            }

            return false;
        }

        // Idempotent re-run: select → select (same type handled above).
        if ($fromType === FieldTypeEnum::Select && $toType === FieldTypeEnum::Select) {
            return is_string($value) ? $value : false;
        }

        return false;
    }

    private function readPublishedValue(CollectionItem $item, CollectionField $field): mixed
    {
        $rows = $item->fieldValues->where('field_id', $field->id)->values();
        if ($rows->isEmpty()) {
            return null;
        }

        if ($field->translatable) {
            $out = [];
            foreach ($rows->groupBy('locale') as $locale => $localeRows) {
                $row = $localeRows->firstWhere('position', 0);
                $out[(string) $locale] = $row?->value;
            }

            return $out;
        }

        return $rows->whereNull('locale')->firstWhere('position', 0)?->value;
    }

    private function readDraftValue(CollectionItem $item, CollectionField $field): mixed
    {
        $draft = is_array($item->draft_data) ? $item->draft_data : [];

        return $draft[$field->name] ?? null;
    }

    /**
     * @return array{item_id: int, status: string, reason: ?string, has_draft: bool, published_before: mixed, published_after: mixed, draft_before: mixed, draft_after: mixed}
     */
    private function itemRow(
        int $itemId,
        string $status,
        ?string $reason,
        bool $hasDraft,
        mixed $publishedBefore,
        mixed $publishedAfter,
        mixed $draftBefore,
        mixed $draftAfter,
    ): array {
        return [
            'item_id' => $itemId,
            'status' => $status,
            'reason' => $reason,
            'has_draft' => $hasDraft,
            'published_before' => $publishedBefore,
            'published_after' => $publishedAfter,
            'draft_before' => $draftBefore,
            'draft_after' => $draftAfter,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function mergeSettings(CollectionField $field, FieldConvertOptionsData $options): array
    {
        $settings = is_array($field->settings) ? $field->settings : [];
        if (is_array($options->settings)) {
            $settings = array_replace($settings, $options->settings);
        }

        return $settings;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array<string, true>
     */
    private function collectOptionValues(array $settings): array
    {
        $options = $settings['options'] ?? [];
        if (! is_array($options)) {
            return [];
        }

        $values = [];
        foreach ($options as $option) {
            if (! is_array($option)) {
                continue;
            }
            $value = isset($option['value']) ? trim((string) $option['value']) : '';
            if ($value !== '') {
                $values[$value] = true;
            }
        }

        return $values;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    private function appendOption(array $settings, string $value): array
    {
        $options = is_array($settings['options'] ?? null) ? $settings['options'] : [];
        foreach ($options as $option) {
            if (is_array($option) && ($option['value'] ?? null) === $value) {
                return $settings;
            }
        }

        $options[] = [
            'value' => mb_substr($value, 0, 255),
            'label' => mb_substr($value, 0, 255),
        ];
        $settings['options'] = $options;

        return $settings;
    }

    private function defaultLocale(): string
    {
        $default = $this->projectSettings->defaultContentLocale();
        if ($this->localeResolver->isAllowed($default)) {
            return $default;
        }

        $allowed = $this->localeResolver->allowedLocales();

        return $allowed[0] ?? 'en';
    }

    private function valueLooksTranslatable(mixed $value): bool
    {
        if (! is_array($value) || $value === []) {
            return false;
        }

        foreach (array_keys($value) as $key) {
            if (! is_string($key) || ! $this->localeResolver->isAllowed($key)) {
                return false;
            }
        }

        return true;
    }

    private function snapshotMatchesTranslatable(CollectionField $field, mixed $value): bool
    {
        if ($value === null) {
            return true;
        }

        return $field->translatable === $this->valueLooksTranslatable($value);
    }

    private function guessSnapshotType(CollectionField $field, mixed $value): FieldTypeEnum
    {
        // Prefer current type when shapes already match.
        if ($this->snapshotMatchesTranslatable($field, $value)) {
            if ($field->type === FieldTypeEnum::Select && is_string($value)) {
                return FieldTypeEnum::Select;
            }
            if ($this->matrix->isTextScalar($field->type) && (is_string($value) || $this->valueLooksTranslatable($value))) {
                return $field->type;
            }
        }

        // Pre-conversion text snapshots restoring onto select.
        if ($field->type === FieldTypeEnum::Select) {
            return FieldTypeEnum::String;
        }

        if ($this->matrix->isTextScalar($field->type)) {
            return FieldTypeEnum::String;
        }

        return $field->type;
    }

    private function unsupportedResult(
        CollectionField $field,
        FieldConvertOptionsData $options,
        FieldTypeEnum $fromType,
        bool $fromTranslatable,
    ): FieldConvertResultData {
        return new FieldConvertResultData(
            supported: false,
            dryRun: $options->dryRun,
            applied: false,
            fromType: $fromType->value,
            toType: $options->toType->value,
            fromTranslatable: $fromTranslatable,
            toTranslatable: $options->toTranslatable,
            items: [],
            counts: ['ok' => 0, 'unchanged' => 0, 'failed' => 0, 'skipped' => 0, 'with_draft' => 0],
            matrix: $this->matrix->documentedMatrix(),
            error: __('This type conversion is not supported. Supported pairs: string↔textarea↔markdown, string→select, and translatable flips.'),
            fieldId: $field->id,
        );
    }

    private function errorResult(
        CollectionField $field,
        FieldConvertOptionsData $options,
        FieldTypeEnum $fromType,
        bool $fromTranslatable,
        string $error,
    ): FieldConvertResultData {
        return new FieldConvertResultData(
            supported: true,
            dryRun: $options->dryRun,
            applied: false,
            fromType: $fromType->value,
            toType: $options->toType->value,
            fromTranslatable: $fromTranslatable,
            toTranslatable: $options->toTranslatable,
            items: [],
            counts: ['ok' => 0, 'unchanged' => 0, 'failed' => 0, 'skipped' => 0, 'with_draft' => 0],
            matrix: $this->matrix->documentedMatrix(),
            error: $error,
            fieldId: $field->id,
        );
    }
}
