/** Authenticated user record from shared Inertia props. */
export type User = {
    id: number;
    first_name: string;
    last_name: string | null;
    email: string;
    avatar?: string;
    email_verified_at: string | null;
    two_factor_enabled?: boolean;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
};

/** Shared auth context: user, permissions, roles, and super-admin flag. */
export type Auth = {
    user: User | null;
    permissions: string[];
    roleNames: string[];
    isSuperAdmin: boolean;
};

/** QR code payload returned during two-factor enrollment. */
export type TwoFactorSetupData = {
    svg: string;
    url: string;
};

/** Manual TOTP secret key for authenticator apps. */
export type TwoFactorSecretKey = {
    secretKey: string;
};
