import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
    FieldOptionRow,
    FieldTreeOptionRow,
} from '@/lib/collection-field-types';

/** Flat value / label choice rows for select, radio, checkbox and autocomplete fields. */
export function OptionsEditor({
    options,
    onChange,
}: {
    options: FieldOptionRow[];
    onChange: (next: FieldOptionRow[]) => void;
}) {
    const { t } = useTranslation();

    return (
        <div className="space-y-4">
            <div>
                <Label>{t('collections.fieldSettings.form.choices')}</Label>
                <p className="mt-2 text-sm text-muted-foreground">
                    {t('collections.fieldSettings.form.choicesHint')}
                </p>
            </div>
            <div className="space-y-3">
                {options.map((option, index) => (
                    <div key={index} className="flex gap-3">
                        <Input
                            placeholder={t(
                                'collections.fieldSettings.rules.value',
                            )}
                            value={option.value}
                            onChange={(event) => {
                                const next = [...options];
                                next[index] = {
                                    ...next[index],
                                    value: event.target.value,
                                };
                                onChange(next);
                            }}
                        />
                        <Input
                            placeholder={t(
                                'collections.fieldSettings.form.optionLabel',
                            )}
                            value={option.label}
                            onChange={(event) => {
                                const next = [...options];
                                next[index] = {
                                    ...next[index],
                                    label: event.target.value,
                                };
                                onChange(next);
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={options.length === 1}
                            onClick={() =>
                                onChange(options.filter((_, i) => i !== index))
                            }
                            aria-label={t('a11y.removeChoice')}
                        >
                            ×
                        </Button>
                    </div>
                ))}
            </div>
            <Button
                type="button"
                variant="outline"
                onClick={() => onChange([...options, { value: '', label: '' }])}
            >
                {t('collections.fieldSettings.form.addChoice')}
            </Button>
        </div>
    );
}

/** Nested choice rows for checkbox tree fields; renders itself for each level. */
export function TreeOptionsEditor({
    options,
    onChange,
    depth = 0,
}: {
    options: FieldTreeOptionRow[];
    onChange: (next: FieldTreeOptionRow[]) => void;
    depth?: number;
}) {
    const { t } = useTranslation();
    const updateNode = (
        index: number,
        updater: (node: FieldTreeOptionRow) => FieldTreeOptionRow,
    ): void => {
        onChange(
            options.map((node, nodeIndex) =>
                nodeIndex === index ? updater(node) : node,
            ),
        );
    };

    return (
        <div className="space-y-4" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
            {depth === 0 && (
                <div>
                    <Label>
                        {t('collections.fieldSettings.form.treeChoices')}
                    </Label>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t('collections.fieldSettings.form.treeChoicesHint')}
                    </p>
                </div>
            )}

            {options.map((option, index) => (
                <div key={index} className="space-y-3 rounded-lg border p-3">
                    <div className="flex gap-3">
                        <Input
                            placeholder={t(
                                'collections.fieldSettings.rules.value',
                            )}
                            value={option.value}
                            onChange={(event) =>
                                updateNode(index, (node) => ({
                                    ...node,
                                    value: event.target.value,
                                }))
                            }
                        />
                        <Input
                            placeholder={t(
                                'collections.fieldSettings.form.optionLabel',
                            )}
                            value={option.label}
                            onChange={(event) =>
                                updateNode(index, (node) => ({
                                    ...node,
                                    label: event.target.value,
                                }))
                            }
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={depth === 0 && options.length === 1}
                            onClick={() =>
                                onChange(options.filter((_, i) => i !== index))
                            }
                            aria-label={t('a11y.removeChoice')}
                        >
                            ×
                        </Button>
                    </div>

                    <TreeOptionsEditor
                        options={option.children ?? []}
                        depth={depth + 1}
                        onChange={(children) =>
                            updateNode(index, (node) => ({
                                ...node,
                                children,
                            }))
                        }
                    />

                    <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                            updateNode(index, (node) => ({
                                ...node,
                                children: [
                                    ...(node.children ?? []),
                                    { value: '', label: '', children: [] },
                                ],
                            }))
                        }
                    >
                        {t('collections.fieldSettings.form.addChild')}
                    </Button>
                </div>
            ))}

            {depth === 0 && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                        onChange([
                            ...options,
                            { value: '', label: '', children: [] },
                        ])
                    }
                >
                    {t('collections.fieldSettings.form.addRootChoice')}
                </Button>
            )}
        </div>
    );
}
