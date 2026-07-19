import AuthLayoutTemplate from '@/layouts/auth/auth-simple-layout';

/**
 * Default auth page wrapper delegating to the simple centered layout.
 * @param {{ children: React.ReactNode, title: string, description: string }} props - Layout props.
 * @param {React.ReactNode} props.children - Auth form content.
 * @param {string} props.title - Page heading.
 * @param {string} props.description - Subheading shown below the title.
 * @returns {JSX.Element}
 */
export default function AuthLayout({
    children,
    title,
    description,
    ...props
}: {
    children: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <AuthLayoutTemplate title={title} description={description} {...props}>
            {children}
        </AuthLayoutTemplate>
    );
}
