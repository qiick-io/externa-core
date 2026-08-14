import { ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import {
    Collapsible,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { FieldTreeNode } from '@/lib/collection-field-groups';
import { isLayoutGroupType } from '@/lib/collection-field-groups';
import { getFieldDisplayName } from '@/lib/collection-field-types';
import { cn } from '@/lib/utils';

type FieldDef = {
    id: number;
    name: string;
    type: string;
    settings?: Record<string, unknown> | null;
};

type RenderFieldsOptions = {
    /** Hide field labels (accordion/tab leaf sections — header is the label). */
    hideLabels?: boolean;
};

type GroupFieldRendererProps<T extends FieldDef> = {
    tree: FieldTreeNode<T>[];
    locales: string[];
    renderField: (field: T) => ReactNode;
    renderFields: (fields: T[], options?: RenderFieldsOptions) => ReactNode;
    checkHidden: (field: T) => boolean;
};

function settingsFlagEnabled(value: unknown): boolean {
    return (
        value === true ||
        value === 1 ||
        value === '1' ||
        value === 'true' ||
        value === 'on'
    );
}

function settingsFlagExplicitlyDisabled(value: unknown): boolean {
    return (
        value === false ||
        value === 0 ||
        value === '0' ||
        value === 'false' ||
        value === 'off'
    );
}

/** Directus default: accordionMode true when unset. */
function accordionModeEnabled(settings?: Record<string, unknown> | null): boolean {
    if (settingsFlagExplicitlyDisabled(settings?.accordion_mode)) {
        return false;
    }

    if (
        settings?.accordion_mode === undefined ||
        settings?.accordion_mode === null
    ) {
        return true;
    }

    return settingsFlagEnabled(settings?.accordion_mode);
}

function groupShellProps(field: FieldDef): Record<string, string | number> {
    return {
        'data-layout-group': field.type,
        'data-group-name': field.name,
        'data-field-type': field.type,
        'data-field-id': field.id,
    };
}

/**
 * Accordion/tab panel body (Directus kitchen_sink):
 * - Raw/detail/… group child → section header is the group label; render its children inside
 * - Legacy leaf-as-direct-child → header is the leaf label; field body without duplicate label
 */
function sectionBody<T extends FieldDef>(
    child: FieldTreeNode<T>,
    renderLevel: (nodes: FieldTreeNode<T>[]) => ReactNode,
    renderFields: (fields: T[], options?: RenderFieldsOptions) => ReactNode,
): ReactNode {
    if (isLayoutGroupType(child.field.type)) {
        // group_raw: nesting only — keep a DOM node so fields-tree ≡ form-tree,
        // including empty tab/accordion sections.
        if (child.field.type === 'group_raw') {
            return (
                <div
                    {...groupShellProps(child.field)}
                    data-group-empty={child.children.length === 0 ? '1' : '0'}
                    className="space-y-3"
                >
                    {renderLevel(child.children)}
                </div>
            );
        }

        // Other group types keep their own chrome inside the panel.
        return renderLevel([child]);
    }

    return renderFields([child.field], { hideLabels: true });
}

function GroupTabsRenderer<T extends FieldDef>({
    node,
    locales,
    renderLevel,
    renderFields,
    checkHidden,
}: {
    node: FieldTreeNode<T>;
    locales: string[];
    renderLevel: (children: FieldTreeNode<T>[]) => ReactNode;
    renderFields: (fields: T[], options?: RenderFieldsOptions) => ReactNode;
    checkHidden: (field: T) => boolean;
}) {
    const { field, children } = node;
    const fillWidth = settingsFlagEnabled(field.settings?.fill_width);
    const visible = children.filter((child) => !checkHidden(child.field));
    const [activeTab, setActiveTab] = useState<string>(
        visible[0]?.field.name ?? '',
    );

    const groupLabel = getFieldDisplayName(
        field.settings,
        field.name,
        locales,
    );

    const activeExists = visible.some((child) => child.field.name === activeTab);
    const resolvedActive = activeExists
        ? activeTab
        : (visible[0]?.field.name ?? '');

    // Keep empty tabs shell visible (fields builder ↔ item form parity).
    return (
        <div
            key={field.id}
            {...groupShellProps(field)}
            data-group-empty={visible.length === 0 ? '1' : '0'}
            className={cn(
                'overflow-hidden rounded-lg border border-input',
                fillWidth && 'w-full min-w-0 col-span-full',
            )}
        >
            {visible.length === 0 ? (
                <div className="border-b border-input px-4 py-3 text-sm font-medium">
                    {groupLabel}
                </div>
            ) : (
                <div className="flex border-b border-input">
                    {visible.map((child, index) => {
                        const label = getFieldDisplayName(
                            child.field.settings,
                            child.field.name,
                            locales,
                        );
                        const isActive = resolvedActive === child.field.name;

                        return (
                            <button
                                key={child.field.id}
                                type="button"
                                data-tab-name={child.field.name}
                                className={cn(
                                    // py-3.5 ≈ old strip py-2 + button py-1.5 (same header height)
                                    'border-r border-input px-3 py-3.5 text-sm last:border-r-0',
                                    index === 0 && 'rounded-tl-lg',
                                    isActive
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground',
                                )}
                                onClick={() => setActiveTab(child.field.name)}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
            <div className="p-4">
                {visible.length === 0 ? (
                    <div className="min-h-4" aria-hidden />
                ) : (
                    visible.map((child) => (
                        <div
                            key={child.field.id}
                            data-tab-panel={child.field.name}
                            className={
                                resolvedActive === child.field.name
                                    ? 'block space-y-3'
                                    : 'hidden'
                            }
                        >
                            {sectionBody(child, renderLevel, renderFields)}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

/**
 * Keep children mounted (form submit) and animate open/close without Radix
 * CollapsibleContent — its layout measure sets transitionDuration=0s / reads
 * height while collapsed, so forceMount + animate-collapsible-* skips first open.
 */
function ForceMountedCollapsibleBody({
    open,
    className,
    children,
}: {
    open: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            data-state={open ? 'open' : 'closed'}
            className={cn(
                'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
                open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                !open && 'pointer-events-none',
                className,
            )}
        >
            <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
    );
}

function GroupAccordionRenderer<T extends FieldDef>({
    node,
    locales,
    renderLevel,
    renderFields,
    checkHidden,
}: {
    node: FieldTreeNode<T>;
    locales: string[];
    renderLevel: (children: FieldTreeNode<T>[]) => ReactNode;
    renderFields: (fields: T[], options?: RenderFieldsOptions) => ReactNode;
    checkHidden: (field: T) => boolean;
}) {
    const { field, children } = node;
    const maxOneOpen = accordionModeEnabled(field.settings);
    let start = (field.settings?.start as string) ?? 'closed';

    if (maxOneOpen && start === 'opened') {
        start = 'closed';
    }

    const visible = children.filter((child) => !checkHidden(child.field));

    const [openItems, setOpenItems] = useState<Set<string>>(() => {
        if (start === 'opened') {
            return new Set(visible.map((c) => c.field.name));
        }

        if (start === 'first' && visible[0]) {
            return new Set([visible[0].field.name]);
        }

        return new Set();
    });

    const toggleItem = (name: string) => {
        if (maxOneOpen) {
            setOpenItems(openItems.has(name) ? new Set() : new Set([name]));
        } else {
            setOpenItems((current) => {
                const next = new Set(current);

                if (next.has(name)) {
                    next.delete(name);
                } else {
                    next.add(name);
                }

                return next;
            });
        }
    };

    const groupLabel = getFieldDisplayName(
        field.settings,
        field.name,
        locales,
    );
    const fillWidth = settingsFlagEnabled(field.settings?.fill_width);

    // Keep empty accordion shell visible (fields builder ↔ item form parity).
    return (
        <div
            key={field.id}
            {...groupShellProps(field)}
            data-group-empty={visible.length === 0 ? '1' : '0'}
            className={cn(
                'overflow-hidden rounded-lg border border-input',
                fillWidth && 'w-full min-w-0 col-span-full',
            )}
        >
            <div className="border-b border-input px-4 py-3 text-sm font-medium">
                {groupLabel}
            </div>
            {visible.length === 0 ? (
                <div className="min-h-4 px-4 py-3" aria-hidden />
            ) : (
                <div className="divide-y divide-border">
                    {visible.map((child) => {
                        const label = getFieldDisplayName(
                            child.field.settings,
                            child.field.name,
                            locales,
                        );
                        const isOpen = openItems.has(child.field.name);

                        return (
                            <Collapsible
                                key={child.field.id}
                                open={isOpen}
                                onOpenChange={() => toggleItem(child.field.name)}
                            >
                                <CollapsibleTrigger
                                    data-accordion-section={child.field.name}
                                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40"
                                >
                                    <ChevronDown
                                        className={cn(
                                            'size-4 shrink-0 text-muted-foreground transition-transform',
                                            isOpen && 'rotate-180',
                                        )}
                                    />
                                    {label}
                                </CollapsibleTrigger>
                                {/* Keep inputs in the form DOM while collapsed so Save still posts values. */}
                                <ForceMountedCollapsibleBody open={isOpen}>
                                    <div className="space-y-3 px-4 pb-4">
                                        {sectionBody(
                                            child,
                                            renderLevel,
                                            renderFields,
                                        )}
                                    </div>
                                </ForceMountedCollapsibleBody>
                            </Collapsible>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function DetailGroupCollapsible({
    label,
    defaultOpen,
    field,
    empty,
    children,
}: {
    label: string;
    defaultOpen: boolean;
    field: FieldDef;
    empty: boolean;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <Collapsible
            open={open}
            onOpenChange={setOpen}
            {...groupShellProps(field)}
            data-group-empty={empty ? '1' : '0'}
            className="space-y-3 rounded-lg border bg-muted/30 p-4 dark:border-sidebar-border"
        >
            <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-sm font-medium">
                {label}
                <ChevronDown
                    className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform',
                        open && 'rotate-180',
                    )}
                />
            </CollapsibleTrigger>
            <ForceMountedCollapsibleBody open={open}>
                <div className="pt-3">{children}</div>
            </ForceMountedCollapsibleBody>
        </Collapsible>
    );
}

export function renderGroupFieldTree<T extends FieldDef>({
    tree,
    locales,
    renderField,
    renderFields,
    checkHidden,
}: GroupFieldRendererProps<T>): ReactNode {
    const renderLevel = (nodes: FieldTreeNode<T>[]): ReactNode => {
        const visible = nodes.filter((node) => !checkHidden(node.field));
        const chunks: ReactNode[] = [];
        let leafBatch: T[] = [];

        const flushLeaves = (): void => {
            if (leafBatch.length === 0) {
                return;
            }

            chunks.push(
                <Fragment
                    key={`leaves-${leafBatch.map((f) => f.id).join('-')}`}
                >
                    {renderFields(leafBatch)}
                </Fragment>,
            );
            leafBatch = [];
        };

        for (const node of visible) {
            if (isLayoutGroupType(node.field.type)) {
                flushLeaves();
                chunks.push(renderGroupNode(node));
            } else {
                leafBatch.push(node.field);
            }
        }

        flushLeaves();

        return <>{chunks}</>;
    };

    const renderGroupNode = (node: FieldTreeNode<T>): ReactNode => {
        const { field, children } = node;

        if (field.type === 'group_tabs') {
            return (
                <GroupTabsRenderer
                    key={field.id}
                    node={node}
                    locales={locales}
                    renderLevel={renderLevel}
                    renderFields={renderFields}
                    checkHidden={checkHidden}
                />
            );
        }

        if (field.type === 'group_accordion') {
            return (
                <GroupAccordionRenderer
                    key={field.id}
                    node={node}
                    locales={locales}
                    renderLevel={renderLevel}
                    renderFields={renderFields}
                    checkHidden={checkHidden}
                />
            );
        }

        if (field.type === 'group_detail') {
            const label = getFieldDisplayName(
                field.settings,
                field.name,
                locales,
            );
            const start = (field.settings?.start as string) ?? 'open';
            const visibleChildren = children.filter(
                (child) => !checkHidden(child.field),
            );

            return (
                <DetailGroupCollapsible
                    key={field.id}
                    label={label}
                    defaultOpen={start !== 'closed'}
                    field={field}
                    empty={visibleChildren.length === 0}
                >
                    {visibleChildren.length === 0 ? (
                        <div className="min-h-4" aria-hidden />
                    ) : (
                        renderLevel(children)
                    )}
                </DetailGroupCollapsible>
            );
        }

        if (field.type === 'group_raw') {
            const label = getFieldDisplayName(
                field.settings,
                field.name,
                locales,
            );
            const visibleChildren = children.filter(
                (child) => !checkHidden(child.field),
            );
            const fillWidth = settingsFlagEnabled(field.settings?.fill_width);

            // Directus group-raw is chrome-less when it has children; empty raw
            // still needs a shell so fields-builder empty groups are not dropped.
            if (visibleChildren.length === 0) {
                return (
                    <div
                        key={field.id}
                        {...groupShellProps(field)}
                        data-group-empty="1"
                        className={cn(
                            'rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground',
                            fillWidth && 'w-full min-w-0 col-span-full',
                        )}
                    >
                        {label}
                    </div>
                );
            }

            return (
                <div
                    key={field.id}
                    {...groupShellProps(field)}
                    data-group-empty="0"
                    className={cn(
                        fillWidth && 'w-full min-w-0 col-span-full',
                    )}
                >
                    {renderLevel(children)}
                </div>
            );
        }

        return <Fragment key={field.id}>{renderLevel(children)}</Fragment>;
    };

    void renderField;

    return renderLevel(tree);
}
