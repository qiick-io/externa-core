<?php

namespace App\Ai\Concerns;

use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemValuesAssembler;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Illuminate\Support\Str;
use Throwable;

/**
 * Shared helpers for AI tools that create collections/fields and import item rows.
 * Expects LogsAiToolUse (for logAiMutation).
 */
trait ImportsCollectionRecords
{
    /**
     * @return array{0: Collection, 1: bool}|string
     */
    protected function resolveCollectionForImport(int $collectionId, string $collectionName): array|string
    {
        if ($collectionId > 0) {
            $collection = Collection::query()->with('fields')->find($collectionId);

            if ($collection === null) {
                return 'Error: Collezione non trovata.';
            }

            return [$collection, false];
        }

        if ($collectionName === '') {
            return 'Error: Serve collection_id oppure collection_name.';
        }

        $slug = Str::slug($collectionName);

        $existing = Collection::query()
            ->with('fields')
            ->where(function ($query) use ($collectionName, $slug): void {
                $query->where('name', $collectionName)->orWhere('slug', $slug);
            })
            ->first();

        if ($existing !== null) {
            return [$existing, false];
        }

        $collection = Collection::query()->create([
            'name' => $collectionName,
            'slug' => Str::slug($collectionName),
            'is_singleton' => false,
        ]);

        $this->logAiMutation($collection, 'create_collection');
        $collection->load('fields');

        return [$collection, true];
    }

    /**
     * @param  list<string|null>  $headerRow
     * @param  list<array<string, string>>  $sampleRows
     * @return list<string> created field names
     */
    protected function ensureFieldsFromHeaders(Collection $collection, array $headerRow, array $sampleRows = []): array
    {
        $created = [];
        $usedNames = $collection->fields->pluck('name')->map(fn ($name) => strtolower((string) $name))->all();
        $usedNames = array_fill_keys($usedNames, true);

        foreach ($headerRow as $header) {
            $label = trim((string) $header);

            if ($label === '') {
                continue;
            }

            if ($this->headerMatchesExistingField($label, $collection)) {
                continue;
            }

            $fieldName = $this->uniqueFieldNameFromHeader($label, $usedNames);

            if ($fieldName === null) {
                continue;
            }

            [$fieldType, $settings] = $this->inferFieldDefinition($label, $sampleRows);

            /** @var CollectionField $field */
            $field = $collection->fields()->create([
                'name' => $fieldName,
                'type' => $fieldType,
                'translatable' => false,
                'settings' => $settings,
            ]);

            $this->logAiMutation($field, 'create_field');
            $usedNames[strtolower($fieldName)] = true;
            $created[] = $fieldName;
        }

        return $created;
    }

    /**
     * Import rows already keyed by source labels (CSV headers or JSON keys).
     *
     * @param  list<array<string, string>>  $rows
     * @return array{
     *     mapped_headers: list<string>,
     *     fields_created: list<string>,
     *     created: int,
     *     updated: int,
     *     skipped: int,
     *     errors: list<string>
     * }
     */
    protected function importAssociativeRows(
        Collection $collection,
        array $rows,
        int $maxRows,
        string $upsertKey = '',
    ): array {
        /** @var array<string, true> $headerSet */
        $headerSet = [];

        foreach ($rows as $row) {
            foreach (array_keys($row) as $key) {
                $label = trim((string) $key);

                if ($label !== '') {
                    $headerSet[$label] = true;
                }
            }
        }

        $headerList = array_keys($headerSet);
        $fieldsCreated = $this->ensureFieldsFromHeaders($collection, $headerList, $rows);
        $collection->load('fields');

        $labelToField = $this->mapLabelsToFields($headerList, $collection);

        if ($labelToField === []) {
            throw new \RuntimeException(
                'Nessuna colonna corrisponde ai campi della collezione ('.
                $collection->fields->pluck('name')->implode(', ').
                ')'
            );
        }

        $normalizer = app(CollectionItemDataNormalizer::class);
        $assembler = app(CollectionItemValuesAssembler::class);
        $writer = app(CollectionItemValuesWriter::class);

        // ponytail: suppress per-row webhooks on bulk import (ceiling: no summary event; upgrade: batched webhook)
        return OutboundWebhookDispatcher::withoutWebhooks(function () use (
            $collection,
            $rows,
            $maxRows,
            $upsertKey,
            $labelToField,
            $fieldsCreated,
            $normalizer,
            $assembler,
            $writer,
        ): array {
            $created = 0;
            $updated = 0;
            $skipped = 0;
            /** @var list<string> $errors */
            $errors = [];
            $rowNumber = 0;
            $upsertFieldName = $upsertKey === '' ? null : ($labelToField[$upsertKey] ?? $upsertKey);
            $existingByUpsertValue = [];

            if ($upsertFieldName !== null && ! $collection->fields->contains('name', $upsertFieldName)) {
                throw new \RuntimeException("Campo upsert_key non trovato: {$upsertKey}");
            }

            if ($upsertFieldName !== null) {
                foreach ($collection->items()->get() as $existingItem) {
                    $existingValue = $assembler->assemble($existingItem)[$upsertFieldName] ?? null;

                    if (is_scalar($existingValue) && (string) $existingValue !== '') {
                        $existingByUpsertValue[(string) $existingValue] = $existingItem;
                    }
                }
            }

            foreach ($rows as $row) {
                $rowNumber++;

                if ($created + $updated + $skipped >= $maxRows) {
                    $errors[] = 'Interrotto dopo '.$maxRows.' righe (limite massimo).';
                    break;
                }

                if ($this->associativeRowIsEmpty($row)) {
                    $skipped++;

                    continue;
                }

                if ($collection->is_singleton && $collection->items()->exists()) {
                    $skipped++;
                    $errors[] = "Riga {$rowNumber}: collezione singleton già popolata.";

                    continue;
                }

                $data = [];

                foreach ($labelToField as $label => $fieldName) {
                    $data[$fieldName] = isset($row[$label]) ? trim((string) $row[$label]) : '';
                }

                try {
                    $upsertValue = $upsertFieldName === null ? null : ($data[$upsertFieldName] ?? null);
                    $item = is_scalar($upsertValue) && (string) $upsertValue !== ''
                        ? ($existingByUpsertValue[(string) $upsertValue] ?? null)
                        : null;
                    $isUpdate = $item !== null;

                    if ($isUpdate) {
                        $data = array_replace($assembler->assemble($item), $data);
                    } else {
                        $item = $collection->items()->create([]);
                    }

                    $normalized = $normalizer->normalize($collection, $data, ! $isUpdate);
                    $writer->sync($item, $collection, $normalized);

                    if ($isUpdate) {
                        $updated++;
                    } else {
                        $created++;
                        $this->logAiMutation($item, 'import_create_item');

                        if (is_scalar($upsertValue) && (string) $upsertValue !== '') {
                            $existingByUpsertValue[(string) $upsertValue] = $item;
                        }
                    }
                } catch (Throwable $exception) {
                    $skipped++;
                    $errors[] = "Riga {$rowNumber}: ".$exception->getMessage();
                }
            }

            return [
                'mapped_headers' => array_values(array_unique(array_values($labelToField))),
                'fields_created' => $fieldsCreated,
                'created' => $created,
                'updated' => $updated,
                'skipped' => $skipped,
                'errors' => array_slice($errors, 0, 25),
            ];
        });
    }

    /**
     * @param  list<array<string, string>>  $rows
     * @return array<string, mixed>
     */
    protected function previewAssociativeRows(?Collection $collection, array $rows, int $previewRows = 10): array
    {
        $headers = array_values(array_unique(array_merge(...array_map('array_keys', $rows))));
        $proposedFields = [];
        $usedNames = $collection?->fields
            ->pluck('name')
            ->map(fn ($name): string => strtolower((string) $name))
            ->mapWithKeys(fn (string $name): array => [$name => true])
            ->all() ?? [];

        foreach ($headers as $header) {
            if ($collection !== null && $this->headerMatchesExistingField($header, $collection)) {
                continue;
            }

            $fieldName = $this->uniqueFieldNameFromHeader($header, $usedNames);

            if ($fieldName === null) {
                continue;
            }

            [$type, $settings] = $this->inferFieldDefinition($header, $rows);
            $proposedFields[] = [
                'name' => $fieldName,
                'type' => $type->value,
                'settings' => $settings,
            ];
            $usedNames[strtolower($fieldName)] = true;
        }

        return [
            'dry_run' => true,
            'collection_id' => $collection?->id,
            'collection_name' => $collection?->name,
            'proposed_fields' => $proposedFields,
            'rows_found' => count($rows),
            'preview_rows' => array_slice($rows, 0, $previewRows),
        ];
    }

    /**
     * @param  list<array<string, string>>  $sampleRows
     * @return array{0: FieldTypeEnum, 1: array<string, mixed>|null}
     */
    protected function inferFieldDefinition(string $label, array $sampleRows): array
    {
        $values = array_values(array_filter(
            array_map(fn (array $row): string => trim((string) ($row[$label] ?? '')), $sampleRows),
            fn (string $value): bool => $value !== '',
        ));

        if ($values === []) {
            return [FieldTypeEnum::String, null];
        }

        $lowerValues = array_map('strtolower', $values);
        $booleanValues = ['true', 'false', 'yes', 'no', 'on', 'off', '1', '0'];

        if (array_diff($lowerValues, $booleanValues) === []) {
            return [FieldTypeEnum::Boolean, null];
        }

        if (array_filter($values, 'is_numeric') === $values) {
            return [FieldTypeEnum::Number, null];
        }

        if (array_filter($values, fn (string $value): bool => (bool) preg_match(
            '/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]+)?$|^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/',
            $value,
        )) === $values) {
            return [FieldTypeEnum::Date, null];
        }

        $uniqueValues = array_values(array_unique($values));

        if (
            count($values) >= 3
            && count($uniqueValues) >= 2
            && count($uniqueValues) <= 10
            && count($uniqueValues) <= floor(count($values) * 0.75)
        ) {
            return [
                FieldTypeEnum::Select,
                ['options' => array_map(
                    fn (string $value): array => ['value' => $value, 'label' => $value],
                    $uniqueValues,
                )],
            ];
        }

        return [FieldTypeEnum::String, null];
    }

    protected function headerMatchesExistingField(string $label, Collection $collection): bool
    {
        $candidates = $this->headerCandidates($label);

        foreach ($collection->fields as $field) {
            /** @var CollectionField $field */
            $fieldKeys = [
                strtolower($field->name),
                Str::slug($field->name),
            ];

            foreach ($candidates as $candidate) {
                if (in_array($candidate, $fieldKeys, true)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @param  array<string, true>  $usedNames
     */
    protected function uniqueFieldNameFromHeader(string $label, array &$usedNames): ?string
    {
        $base = Str::slug($label, '_');

        if ($base === '') {
            return null;
        }

        if (! preg_match('/^[a-z]/', $base)) {
            $base = 'f_'.$base;
        }

        $base = preg_replace('/[^a-z0-9_]/', '', $base) ?? $base;

        if ($base === '' || ! preg_match('/^[a-z][a-z0-9_]*$/', $base)) {
            return null;
        }

        $candidate = $base;
        $suffix = 2;

        while (isset($usedNames[strtolower($candidate)])) {
            $candidate = $base.'_'.$suffix;
            $suffix++;
        }

        return $candidate;
    }

    /**
     * @param  list<string|null>  $headerRow
     * @return array<int, string> column index => field name
     */
    protected function mapHeadersToFields(array $headerRow, Collection $collection): array
    {
        $labelToField = $this->mapLabelsToFields(
            array_map(fn ($header) => trim((string) $header), $headerRow),
            $collection,
        );

        $mapped = [];

        foreach ($headerRow as $index => $header) {
            $label = trim((string) $header);

            if ($label !== '' && isset($labelToField[$label])) {
                $mapped[(int) $index] = $labelToField[$label];
            }
        }

        return $mapped;
    }

    /**
     * @param  list<string|null>  $labels
     * @return array<string, string> label => field name
     */
    protected function mapLabelsToFields(array $labels, Collection $collection): array
    {
        /** @var array<string, string> $fieldByKey */
        $fieldByKey = [];

        foreach ($collection->fields as $field) {
            /** @var CollectionField $field */
            $fieldByKey[strtolower($field->name)] = $field->name;
            $fieldByKey[Str::slug($field->name)] = $field->name;
            $fieldByKey[Str::slug($field->name, '_')] = $field->name;
        }

        $mapped = [];

        foreach ($labels as $label) {
            $trimmed = trim((string) $label);

            if ($trimmed === '' || isset($mapped[$trimmed])) {
                continue;
            }

            foreach ($this->headerCandidates($trimmed) as $candidate) {
                if (isset($fieldByKey[$candidate])) {
                    $mapped[$trimmed] = $fieldByKey[$candidate];
                    break;
                }
            }
        }

        return $mapped;
    }

    /**
     * @return list<string>
     */
    protected function headerCandidates(string $label): array
    {
        $slugUnderscore = Str::slug($label, '_');
        $prefixed = preg_match('/^[a-z]/', $slugUnderscore) ? $slugUnderscore : 'f_'.$slugUnderscore;

        return array_values(array_unique(array_filter([
            strtolower($label),
            Str::slug($label),
            $slugUnderscore,
            strtolower(str_replace(' ', '_', $label)),
            $prefixed,
        ])));
    }

    /**
     * @param  list<string|null>  $row
     */
    protected function rowIsEmpty(array $row): bool
    {
        foreach ($row as $cell) {
            if (trim((string) $cell) !== '') {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, string>  $row
     */
    protected function associativeRowIsEmpty(array $row): bool
    {
        foreach ($row as $cell) {
            if (trim((string) $cell) !== '') {
                return false;
            }
        }

        return true;
    }
}
