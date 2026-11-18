import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderIconButton } from '@/components/admin/header-icon-button';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { requestItemAiDraft } from '@/lib/ai-item-draft';
import type {
    ItemAiDraftResponse,
    ItemAiDraftValue,
} from '@/lib/ai-item-draft';
import { getFieldDisplayName } from '@/lib/collection-field-types';
import { contentLocaleMeta } from '@/lib/content-locales-catalog';
import type { FieldDef } from '@/types';

/** Mirrors GenerateItemAiDraftRequest::MAX_PROMPT_LENGTH. */
const MAX_PROMPT_LENGTH = 2000;

type ItemAiDraftDialogProps = {
    collectionId: number;
    fields: FieldDef[];
    locales: string[];
    defaultLocale: string;
    /** Fill the unsaved form with the accepted draft (never saves). */
    onApply: (draft: Record<string, ItemAiDraftValue>, locale: string) => void;
};

function previewText(value: ItemAiDraftValue): string {
    return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * "AI draft" toolbar button and dialog for the item editor (#210): the editor
 * writes a brief, previews the proposed values (and the fields the server
 * dropped as invalid), then fills the form. Saving stays a separate step.
 */
export function ItemAiDraftDialog({
    collectionId,
    fields,
    locales,
    defaultLocale,
    onApply,
}: ItemAiDraftDialogProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [locale, setLocale] = useState(defaultLocale);
    const [isGenerating, setIsGenerating] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [draft, setDraft] = useState<ItemAiDraftResponse | null>(null);

    const labelFor = (fieldName: string): string => {
        const field = fields.find((candidate) => candidate.name === fieldName);

        return getFieldDisplayName(field?.settings, fieldName, locales);
    };

    const generateDraft = async (): Promise<void> => {
        setIsGenerating(true);
        setErrorMessage(null);
        setDraft(null);

        try {
            setDraft(
                await requestItemAiDraft(collectionId, {
                    prompt: prompt.trim(),
                    locale,
                }),
            );
        } catch (error) {
            setErrorMessage(
                error instanceof Error && error.message !== ''
                    ? error.message
                    : t('collections.aiDraft.error'),
            );
        } finally {
            setIsGenerating(false);
        }
    };

    const draftEntries = Object.entries(draft?.data ?? {});

    return (
        <>
            <HeaderIconButton
                type="button"
                label={t('collections.aiDraft.button')}
                className="text-ai-text hover:text-ai-text"
                data-test="open-ai-draft"
                onClick={() => setOpen(true)}
            >
                <Sparkles className="size-4" />
            </HeaderIconButton>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="max-w-2xl"
                    data-test="ai-draft-dialog"
                >
                    <DialogHeader>
                        <DialogTitle>
                            {t('collections.aiDraft.title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('collections.aiDraft.description')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="ai-draft-prompt">
                                {t('collections.aiDraft.prompt')}
                            </Label>
                            <Textarea
                                id="ai-draft-prompt"
                                value={prompt}
                                maxLength={MAX_PROMPT_LENGTH}
                                rows={4}
                                placeholder={t(
                                    'collections.aiDraft.promptPlaceholder',
                                )}
                                onChange={(event) =>
                                    setPrompt(event.target.value)
                                }
                            />
                        </div>

                        {locales.length > 1 && (
                            <div className="space-y-2">
                                <Label htmlFor="ai-draft-locale">
                                    {t('collections.aiDraft.locale')}
                                </Label>
                                <Select
                                    value={locale}
                                    onValueChange={setLocale}
                                >
                                    <SelectTrigger
                                        id="ai-draft-locale"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent align="start">
                                        {locales.map((code) => (
                                            <SelectItem key={code} value={code}>
                                                {contentLocaleMeta(code).name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {errorMessage !== null && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {errorMessage}
                            </p>
                        )}

                        {draft !== null && (
                            <div
                                className="space-y-3"
                                data-test="ai-draft-preview"
                            >
                                <p className="text-sm font-medium">
                                    {t('collections.aiDraft.preview')}
                                </p>
                                {draftEntries.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        {t('collections.aiDraft.empty')}
                                    </p>
                                ) : (
                                    <dl className="max-h-72 space-y-2 overflow-auto rounded-md border bg-muted/40 p-3 text-sm">
                                        {draftEntries.map(
                                            ([fieldName, value]) => (
                                                <div key={fieldName}>
                                                    <dt className="font-medium">
                                                        {labelFor(fieldName)}
                                                    </dt>
                                                    <dd className="break-words whitespace-pre-wrap text-muted-foreground">
                                                        {previewText(value)}
                                                    </dd>
                                                </div>
                                            ),
                                        )}
                                    </dl>
                                )}
                                {draft.dropped.length > 0 && (
                                    <div className="space-y-1 text-sm">
                                        <p className="font-medium text-destructive">
                                            {t('collections.aiDraft.dropped')}
                                        </p>
                                        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                                            {draft.dropped.map((entry) => (
                                                <li key={entry.field}>
                                                    {labelFor(entry.field)}:{' '}
                                                    {entry.reason}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={isGenerating || prompt.trim().length < 3}
                            data-test="ai-draft-generate"
                            onClick={() => {
                                void generateDraft();
                            }}
                        >
                            {isGenerating ? <Spinner /> : null}
                            {draft === null
                                ? t('collections.aiDraft.generate')
                                : t('collections.aiDraft.regenerate')}
                        </Button>
                        <Button
                            type="button"
                            variant="ai"
                            disabled={isGenerating || draftEntries.length === 0}
                            data-test="ai-draft-apply"
                            onClick={() => {
                                if (draft === null) {
                                    return;
                                }

                                onApply(draft.data, locale);
                                setOpen(false);
                                setDraft(null);
                            }}
                        >
                            {t('collections.aiDraft.apply')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
