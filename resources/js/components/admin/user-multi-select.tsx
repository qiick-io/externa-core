import { formatUserDisplayName } from '@/hooks/use-initials';
import adminRoutes from '@/lib/admin-routes';
import type { AdminSelectOption, AdminUserRow } from '@/types/admin';
import { PaginatedMultiSelect } from './paginated-multi-select';
import type { PaginatedMultiSelectProps } from './paginated-multi-select';

function userOption(
    user: Pick<AdminUserRow, 'id' | 'first_name' | 'last_name' | 'email'>,
): AdminSelectOption {
    const name = formatUserDisplayName(user.first_name, user.last_name);

    return {
        id: user.id,
        label: name ? `${name} (${user.email})` : user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
    };
}

export type UserMultiSelectProps = Omit<
    PaginatedMultiSelectProps,
    'fetchUrl' | 'placeholder' | 'showUserDetails'
> & {
    placeholder?: string;
    initialUsers?:
        | Pick<AdminUserRow, 'id' | 'first_name' | 'last_name' | 'email'>[]
        | null;
};

/**
 * User picker backed by paginated search (avatar + name / email).
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
        initialOptions ?? initialUsers?.map(userOption) ?? [];

    return (
        <PaginatedMultiSelect
            fetchUrl={adminRoutes.users.index()}
            placeholder={placeholder}
            initialOptions={resolvedInitial}
            showUserDetails
            {...props}
        />
    );
}
