import adminRoutes from '@/lib/admin-routes';
import type { AdminSelectOption } from '@/types/admin';
import {
    PaginatedMultiSelect
    
} from './paginated-multi-select';
import type {PaginatedMultiSelectProps} from './paginated-multi-select';

export type RoleMultiSelectProps = Omit<
    PaginatedMultiSelectProps,
    'fetchUrl' | 'placeholder'
> & {
    placeholder?: string;
    initialRoles?: { id: number; name: string }[] | null;
};

/**
 * Role picker backed by paginated search.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function RoleMultiSelect({
    placeholder = 'Select roles…',
    initialRoles,
    initialOptions,
    ...props
}: RoleMultiSelectProps) {
    const resolvedInitial: AdminSelectOption[] =
        initialOptions ??
        (initialRoles?.map((r) => ({ id: r.id, label: r.name })) ?? []);

    return (
        <PaginatedMultiSelect
            fetchUrl={adminRoutes.roles.index()}
            placeholder={placeholder}
            initialOptions={resolvedInitial}
            {...props}
        />
    );
}
