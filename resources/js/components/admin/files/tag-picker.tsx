import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FileTag } from '@/types/files';

type TagPickerProps = {
    value: string[];
    onChange: (tags: string[]) => void;
    catalog: FileTag[];
    disabled?: boolean;
    placeholder?: string;
    id?: string;
};

function findExactCatalogMatch(
    catalog: FileTag[],
    typedName: string,
): FileTag | undefined {
    return catalog.find((tag) => tag.name === typedName);
}

/**
 * Multi-select for assigning tags to files.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function TagPicker({
    value,
    onChange,
    catalog,
    disabled = false,
    placeholder = 'Type a tag and press Enter',
    id,
}: TagPickerProps) {
    const [inputValue, setInputValue] = useState('');

    const availableCatalogTags = useMemo(
        () => catalog.filter((tag) => !value.includes(tag.name)),
        [catalog, value],
    );

    const addTagName = (rawName: string): void => {
        const trimmedName = rawName.trim();

        if (!trimmedName) {
            setInputValue('');

            return;
        }

        const existingTag = findExactCatalogMatch(catalog, trimmedName);
        const resolvedName = existingTag?.name ?? trimmedName;

        if (!value.includes(resolvedName)) {
            onChange([...value, resolvedName]);
        }

        setInputValue('');
    };

    const toggleCatalogTag = (tagName: string): void => {
        if (value.includes(tagName)) {
            onChange(value.filter((entry) => entry !== tagName));

            return;
        }

        onChange([...value, tagName]);
    };

    const exactMatchHint = inputValue.trim()
        ? findExactCatalogMatch(catalog, inputValue.trim())
        : undefined;

    return (
        <div className="space-y-2">
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {value.map((tagName) => (
                        <button
                            key={tagName}
                            type="button"
                            className="bg-muted rounded-md px-2 py-0.5 text-xs"
                            disabled={disabled}
                            onClick={() =>
                                onChange(
                                    value.filter((entry) => entry !== tagName),
                                )
                            }
                        >
                            {tagName} ×
                        </button>
                    ))}
                </div>
            )}

            <Input
                id={id}
                value={inputValue}
                disabled={disabled}
                placeholder={placeholder}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        addTagName(inputValue);
                    }
                }}
            />

            {exactMatchHint && (
                <p className="text-muted-foreground text-xs">
                    Exact match — will reuse existing tag “{exactMatchHint.name}
                    ”
                </p>
            )}

            {availableCatalogTags.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-muted-foreground text-xs font-medium">
                        Existing tags
                    </p>
                    <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
                        {availableCatalogTags.map((tag) => (
                            <button
                                key={tag.id}
                                type="button"
                                disabled={disabled}
                                className={cn(
                                    'rounded-md border px-2 py-0.5 text-xs transition-colors',
                                    'hover:bg-muted border-sidebar-border/70',
                                )}
                                onClick={() => toggleCatalogTag(tag.name)}
                            >
                                {tag.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
