import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import { describeAssistantToolCall } from '@/lib/ai-tool-call-descriptions';
import { scalarToString } from '@/lib/scalar-to-string';

const LABELS: Record<string, string> = {
    'ai.toolCalls.ManageCollections.list': 'List collections',
    'ai.toolCalls.ManageCollectionItems.create': 'Create an item',
    'ai.toolCalls.ExportCollection._': 'Export a collection',
};

/** A `t` that knows a few labels and honours `defaultValue` like i18next. */
const translate = ((key: string, options?: Record<string, unknown>) =>
    LABELS[key] ??
    (options && 'defaultValue' in options
        ? options.defaultValue
        : `${key}:${scalarToString(options?.tool, '')}`)) as unknown as TFunction;

describe('describeAssistantToolCall', () => {
    it('labels a tool action and names the record it touches', () => {
        expect(
            describeAssistantToolCall(
                {
                    name: 'ManageCollectionItems',
                    input: { action: 'create', title: 'Mira sofa' },
                    state: 'output-available',
                },
                translate,
            ),
        ).toEqual({ title: 'Create an item', description: 'Mira sofa' });
    });

    it('labels a single-action tool without an action', () => {
        expect(
            describeAssistantToolCall(
                {
                    name: 'ExportCollection',
                    input: { collection_id: 3, format: 'csv' },
                    state: 'input-available',
                },
                translate,
            ),
        ).toEqual({ title: 'Export a collection', description: undefined });
    });

    it('falls back to the generic sentence for an unknown tool or action', () => {
        expect(
            describeAssistantToolCall(
                {
                    name: 'ManageCollections',
                    input: { action: 'archive' },
                    state: 'output-error',
                },
                translate,
            ).title,
        ).toBe('ai.tool.title.error:Manage collections');
    });
});
