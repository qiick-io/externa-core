import { Eye } from 'lucide-react';
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
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { jsonRequestHeaders } from '@/lib/csrf';
import { toast } from '@/lib/toast';

export type PreviewRoleOption = {
    id: number;
    name: string;
    is_public: boolean;
};

type PreviewResult = {
    readable: boolean;
    role: { id: number; name: string; is_public: boolean };
    data: Record<string, unknown> | null;
    message: string | null;
};

type ItemPreviewAsRoleDialogProps = {
    collectionId: number;
    itemId: number;
    roles: PreviewRoleOption[];
};

function previewRoleLabel(
    role: PreviewRoleOption,
    t: (key: string, options?: { defaultValue: string }) => string,
): string {
    const fallback = role.name
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());

    return t(`roles.names.${role.name}`, { defaultValue: fallback });
}

/**
 * Admin “Preview as role / public” — read-only JSON of redacted field payload.
 */
export function ItemPreviewAsRoleDialog({
    collectionId,
    itemId,
    roles,
}: ItemPreviewAsRoleDialogProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [roleKey, setRoleKey] = useState<string>(() => {
        const pub = roles.find((r) => r.is_public);

        return pub ? `public:${pub.id}` : roles[0] ? `role:${roles[0].id}` : '';
    });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<PreviewResult | null>(null);

    const runPreview = async (): Promise<void> => {
        if (!roleKey) {
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            const asPublic = roleKey.startsWith('public:');
            const roleId = Number(roleKey.split(':')[1]);
            const params = new URLSearchParams(
                asPublic
                    ? { as_public: '1' }
                    : { role_id: String(roleId) },
            );
            const response = await fetch(
                `/collections/${collectionId}/items/${itemId}/preview-as-role?${params}`,
                {
                    method: 'GET',
                    headers: jsonRequestHeaders(),
                    credentials: 'same-origin',
                },
            );

            if (!response.ok) {
                throw new Error(
                    (await response.text()) || 'Preview failed',
                );
            }

            setResult((await response.json()) as PreviewResult);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Preview failed',
            );
        } finally {
            setLoading(false);
        }
    };

    if (roles.length === 0) {
        return null;
    }

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-test="preview-as-role"
                        aria-label={t('collections.itemToolbar.previewAs')}
                        onClick={() => {
                            setOpen(true);
                            setResult(null);
                        }}
                    >
                        <Eye className="size-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    {t('collections.itemToolbar.previewAs')}
                </TooltipContent>
            </Tooltip>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="max-w-2xl"
                    data-test="preview-as-role-dialog"
                >
                    <DialogHeader>
                        <DialogTitle>Preview as role</DialogTitle>
                        <DialogDescription>
                            Read-only view of field data after collection ACL and
                            file access rules (including{' '}
                            <code className="text-xs">access: denied</code>).
                            Not a visual editor.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="preview-role">Role</Label>
                            <Select
                                value={roleKey}
                                onValueChange={setRoleKey}
                            >
                                <SelectTrigger id="preview-role" className="w-full">
                                    <SelectValue placeholder="Choose role" />
                                </SelectTrigger>
                                <SelectContent
                                    align="start"
                                    className="w-[var(--radix-select-trigger-width)]"
                                >
                                    {roles.map((role) => (
                                        <SelectItem
                                            key={role.id}
                                            value={
                                                role.is_public
                                                    ? `public:${role.id}`
                                                    : `role:${role.id}`
                                            }
                                        >
                                            {previewRoleLabel(role, t)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {result && (
                            <div
                                className="space-y-2"
                                data-test="preview-as-role-result"
                            >
                                {!result.readable && (
                                    <p className="text-sm text-destructive">
                                        {result.message ??
                                            'Not readable for this role.'}
                                    </p>
                                )}
                                {result.readable && result.data && (
                                    <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
                                        {JSON.stringify(result.data, null, 2)}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="secondary"
                            data-test="preview-as-role-close"
                            onClick={() => setOpen(false)}
                        >
                            Close
                        </Button>
                        <Button
                            type="button"
                            disabled={loading || !roleKey}
                            data-test="preview-as-role-run"
                            onClick={() => {
                                void runPreview();
                            }}
                        >
                            {loading ? 'Loading…' : 'Preview'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
