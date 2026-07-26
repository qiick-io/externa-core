import adminRoutes from '@/lib/admin-routes';
import type { AdminSelectOption, AdminUserRow } from '@/types/admin';
import { PaginatedMultiSelect } from './paginated-multi-select';
import type { PaginatedMultiSelectProps } from './paginated-multi-select';

function userLabel(
    user: Pick<AdminUserRow, 'first_name' | 'last_name' | 'email'>,
): string {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');

    return name ? `${name} (${user.email})` : user.email;
}

export type UserMultiSelectProps = Omit<
    PaginatedMultiSelectProps,
    'fetchUrl' | 'placeholder'
> & {
    placeholder?: string;
    initialUsers?:
        | Pick<AdminUserRow, 'id' | 'first_name' | 'last_name' | 'email'>[]
        | null;
};

/**
 * User picker backed by paginated search.
 * @param {*} props - Component props.
 * @returns {JSX.Element}
 */
export function UserMultiSelect({
    placeholder = 'Select users…',
    initialUsers,
    initialOptions,
    ...props
}: UserMultiSelectProps) {
    const resolvedInitial: AdminSelectOption[] =
        initialOptions ??
        initialUsers?.map((u) => ({ id: u.id, label: userLabel(u) })) ??
        [];

    return (
        <PaginatedMultiSelect
            fetchUrl={adminRoutes.users.index()}
            placeholder={placeholder}
            initialOptions={resolvedInitial}
            {...props}
        />
    );
}
