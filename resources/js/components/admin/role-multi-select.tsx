import adminRoutes from '@/lib/admin-routes';
import type { AdminSelectOption } from '@/types/admin';
import {
    PaginatedMultiSelect,
    type PaginatedMultiSelectProps,
} from './paginated-multi-select';

export type RoleMultiSelectProps = Omit<
    PaginatedMultiSelectProps,
    'fetchUrl' | 'placeholder'
> & {
    placeholder?: string;
    initialRoles?: { id: number; name: string }[] | null;
};

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
