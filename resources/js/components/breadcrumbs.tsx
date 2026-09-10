import { Link } from '@inertiajs/react';
import { Fragment } from 'react';
import { TruncatedText } from '@/components/admin/truncated-text';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

/**
 * Renders a linked breadcrumb trail from the given items.
 * @param {{ breadcrumbs: BreadcrumbItemType[] }} props - Component props.
 * @param {BreadcrumbItemType[]} props.breadcrumbs - Ordered trail segments (last item is current page).
 * @returns {JSX.Element}
 */
export function Breadcrumbs({
    breadcrumbs,
}: {
    breadcrumbs: BreadcrumbItemType[];
}) {
    return (
        <>
            {breadcrumbs.length > 0 && (
                <Breadcrumb className="min-w-0">
                    <BreadcrumbList className="flex-nowrap overflow-hidden">
                        {breadcrumbs.map((item, index) => {
                            const isLast = index === breadcrumbs.length - 1;

                            return (
                                <Fragment key={index}>
                                    <BreadcrumbItem className="min-w-0 max-w-[9rem] shrink md:max-w-[12rem]">
                                        {isLast ? (
                                            <BreadcrumbPage className="block min-w-0 max-w-full">
                                                <TruncatedText
                                                    text={item.title}
                                                />
                                            </BreadcrumbPage>
                                        ) : (
                                            <BreadcrumbLink
                                                asChild
                                                className="block min-w-0 max-w-full"
                                            >
                                                <Link
                                                    href={item.href}
                                                    className="block min-w-0 max-w-full"
                                                >
                                                    <TruncatedText
                                                        text={item.title}
                                                    />
                                                </Link>
                                            </BreadcrumbLink>
                                        )}
                                    </BreadcrumbItem>
                                    {!isLast && <BreadcrumbSeparator />}
                                </Fragment>
                            );
                        })}
                    </BreadcrumbList>
                </Breadcrumb>
            )}
        </>
    );
}
