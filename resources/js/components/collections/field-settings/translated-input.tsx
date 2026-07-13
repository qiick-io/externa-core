import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    COLLECTION_FIELD_LOCALES,
    type CollectionFieldLocale,
    type TranslatedText,
} from '@/lib/collection-field-types';

type TranslatedInputProps = {
    idPrefix: string;
    label: string;
    description?: string;
    value: TranslatedText;
    onChange: (next: TranslatedText) => void;
    namePrefix?: string;
};

const LOCALE_LABELS: Record<CollectionFieldLocale, string> = {
    en: 'English',
    it: 'Italiano',
};

export function TranslatedInput({
    idPrefix,
    label,
    description,
    value,
    onChange,
    namePrefix,
}: TranslatedInputProps) {
    return (
        <div className="space-y-3">
            <div>
                <Label>{label}</Label>
                {description ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {COLLECTION_FIELD_LOCALES.map((locale) => (
                    <div key={locale} className="grid gap-2">
                        <Label htmlFor={`${idPrefix}_${locale}`}>
                            {LOCALE_LABELS[locale]}
                        </Label>
                        <Input
                            id={`${idPrefix}_${locale}`}
                            name={
                                namePrefix
                                    ? `${namePrefix}[${locale}]`
                                    : undefined
                            }
                            value={value[locale] ?? ''}
                            onChange={(event) =>
                                onChange({
                                    ...value,
                                    [locale]: event.target.value,
                                })
                            }
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
