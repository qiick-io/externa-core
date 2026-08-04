import { Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { contentLocaleMeta } from '@/lib/content-locales-catalog';

type FillFromLocaleDialogProps = {
    locales: string[];
    currentLocale: string;
    onFill: (sourceLocale: string) => void;
};

/**
 * Dialog to fill all translatable fields from another locale.
 */
export function FillFromLocaleDialog({
    locales,
    currentLocale,
    onFill,
}: FillFromLocaleDialogProps) {
    const { t } = useTranslation();
    const [sourceLocale, setSourceLocale] = useState<string>(
        locales.filter((l) => l !== currentLocale)[0] ?? locales[0] ?? 'en',
    );
    const [open, setOpen] = useState(false);

    const availableLocales = locales.filter((l) => l !== currentLocale);

    if (availableLocales.length === 0) {
        return null;
    }

    const handleConfirm = (): void => {
        onFill(sourceLocale);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                >
                    <Copy className="size-4" />
                    {t('collections.localized.fillFrom')}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {t('collections.localized.fillFromDialogTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('collections.localized.fillFromDialogDescription', {
                            targetLocale: currentLocale.toUpperCase(),
                        })}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="source-locale">
                            {t('collections.localized.sourceLocale')}
                        </Label>
                        <Select value={sourceLocale} onValueChange={setSourceLocale}>
                            <SelectTrigger id="source-locale">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {availableLocales.map((code) => {
                                    const meta = contentLocaleMeta(code);
                                    return (
                                        <SelectItem key={code} value={code}>
                                            <span className="flex items-center gap-2">
                                                <span>{meta.name}</span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {code}
                                                </span>
                                            </span>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    <p className="text-sm text-muted-foreground">
                        {t('collections.localized.overwriteWarning', {
                            targetLocale: currentLocale.toUpperCase(),
                        })}
                    </p>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setOpen(false)}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button type="button" onClick={handleConfirm}>
                        {t('collections.localized.confirmFill')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
