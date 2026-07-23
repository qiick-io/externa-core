<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Support\Collections\CollectionLocaleResolver;

/**
 * Normalize and validate collection form_layout presentation metadata.
 *
 * Fields remain leaves; layout only groups them into optional tabs + sections.
 */
class CollectionFormLayoutNormalizer
{
    public function __construct(
        private CollectionLocaleResolver $localeResolver,
    ) {}

    /**
     * @param  array<string, mixed>|null  $layout
     * @return array{version: int, tabs: list<array<string, mixed>>, sections: list<array<string, mixed>>}|null
     */
    public function normalize(?array $layout, Collection $collection): ?array
    {
        if ($layout === null || $layout === []) {
            return null;
        }

        $collection->loadMissing('fields');
        $validFieldIds = $collection->fields->pluck('id')->map(fn ($id) => (int) $id)->all();
        $validFieldIdSet = array_fill_keys($validFieldIds, true);

        $tabs = [];
        $tabIds = [];
        $rawTabs = data_get($layout, 'tabs', []);
        if (is_array($rawTabs)) {
            foreach ($rawTabs as $rawTab) {
                if (! is_array($rawTab)) {
                    continue;
                }

                $id = $this->normalizeId(data_get($rawTab, 'id'));
                if ($id === null || isset($tabIds[$id])) {
                    continue;
                }

                $tabIds[$id] = true;
                $tabs[] = [
                    'id' => $id,
                    'label' => $this->normalizeLabel(data_get($rawTab, 'label')),
                ];
            }
        }

        $sections = [];
        $seenFieldIds = [];
        $rawSections = data_get($layout, 'sections', []);
        if (! is_array($rawSections)) {
            $rawSections = [];
        }

        foreach ($rawSections as $rawSection) {
            if (! is_array($rawSection)) {
                continue;
            }

            $id = $this->normalizeId(data_get($rawSection, 'id')) ?? $this->newId('section');
            $tabId = $this->normalizeId(data_get($rawSection, 'tab_id'));
            if ($tabId !== null && ! isset($tabIds[$tabId])) {
                $tabId = null;
            }

            $fieldIds = [];
            $rawFieldIds = data_get($rawSection, 'field_ids', []);
            if (is_array($rawFieldIds)) {
                foreach ($rawFieldIds as $rawFieldId) {
                    if (! is_numeric($rawFieldId)) {
                        continue;
                    }

                    $fieldId = (int) $rawFieldId;
                    if (! isset($validFieldIdSet[$fieldId]) || isset($seenFieldIds[$fieldId])) {
                        continue;
                    }

                    $seenFieldIds[$fieldId] = true;
                    $fieldIds[] = $fieldId;
                }
            }

            $sections[] = [
                'id' => $id,
                'tab_id' => $tabId,
                'label' => $this->normalizeLabel(data_get($rawSection, 'label')),
                'collapsible' => $this->flag(data_get($rawSection, 'collapsible', true)),
                'collapsed' => $this->flag(data_get($rawSection, 'collapsed', false)),
                'field_ids' => $fieldIds,
            ];
        }

        if ($tabs === [] && $sections === []) {
            return null;
        }

        return [
            'version' => 1,
            'tabs' => $tabs,
            'sections' => $sections,
        ];
    }

    /**
     * Resolve ordered field ids for rendering: layout sections first, then leftover schema order.
     *
     * @param  array{version?: int, tabs?: list<array<string, mixed>>, sections?: list<array<string, mixed>>}|null  $layout
     * @return list<array{section: array<string, mixed>|null, field_ids: list<int>}>
     */
    public function resolveRenderGroups(?array $layout, Collection $collection): array
    {
        $collection->loadMissing('fields');
        $allFieldIds = $collection->fields
            ->filter(fn ($field) => ! $field->isHiddenInForm())
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();

        $normalized = $this->normalize($layout, $collection);
        if ($normalized === null) {
            return [[
                'section' => null,
                'field_ids' => $allFieldIds,
            ]];
        }

        $placed = [];
        $groups = [];

        foreach ($normalized['sections'] as $section) {
            /** @var list<int> $fieldIds */
            $fieldIds = $section['field_ids'];
            $visible = [];
            foreach ($fieldIds as $fieldId) {
                if (in_array($fieldId, $allFieldIds, true)) {
                    $visible[] = $fieldId;
                    $placed[$fieldId] = true;
                }
            }

            $groups[] = [
                'section' => $section,
                'field_ids' => $visible,
            ];
        }

        $leftover = array_values(array_filter(
            $allFieldIds,
            fn (int $fieldId) => ! isset($placed[$fieldId]),
        ));

        if ($leftover !== []) {
            $groups[] = [
                'section' => [
                    'id' => 'unsectioned',
                    'tab_id' => null,
                    'label' => ['en' => 'Other'],
                    'collapsible' => false,
                    'collapsed' => false,
                    'field_ids' => $leftover,
                ],
                'field_ids' => $leftover,
            ];
        }

        return $groups;
    }

    /**
     * @return array<string, string>
     */
    private function normalizeLabel(mixed $label): array
    {
        $out = [];
        if (! is_array($label)) {
            if (is_string($label) && trim($label) !== '') {
                $defaultLocale = $this->localeResolver->defaultLocale() ?? 'en';

                return [$defaultLocale => trim($label)];
            }

            return $out;
        }

        foreach ($label as $locale => $value) {
            if (! is_string($locale) || ! is_string($value)) {
                continue;
            }

            $trimmed = trim($value);
            if ($trimmed !== '') {
                $out[$locale] = $trimmed;
            }
        }

        return $out;
    }

    private function normalizeId(mixed $id): ?string
    {
        if (! is_string($id) && ! is_numeric($id)) {
            return null;
        }

        $normalized = trim((string) $id);

        return $normalized === '' ? null : $normalized;
    }

    private function newId(string $prefix): string
    {
        return $prefix.'-'.bin2hex(random_bytes(4));
    }

    private function flag(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        return in_array($value, [1, '1', 'true', 'on'], true);
    }
}
