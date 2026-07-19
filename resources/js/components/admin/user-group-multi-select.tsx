import adminRoutes from '@/lib/admin-routes';
import type { AdminSelectOption } from '@/types/admin';
import {
    PaginatedMultiSelect
    
} from './paginated-multi-select';
import type {PaginatedMultiSelectProps} from './paginated-multi-select';

export type UserGroupMultiSelectProps = Omit<
    PaginatedMultiSelectProps,
    'fetchUrl' | 'placeholder'
> & {
    placeholder?: string;
    initialGroups?: { id: number; name: string }[] | null;
};

/**
 * Group picker backed by paginated search.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function UserGroupMultiSelect({
    placeholder = 'Select groups…',
    initialGroups,
    initialOptions,
    ...props
}: UserGroupMultiSelectProps) {
    const resolvedInitial: AdminSelectOption[] =
        initialOptions ??
        (initialGroups?.map((g) => ({ id: g.id, label: g.name })) ?? []);

    return (
        <PaginatedMultiSelect
            fetchUrl={adminRoutes.groups.index()}
            placeholder={placeholder}
            initialOptions={resolvedInitial}
            {...props}
        />
    );
}
