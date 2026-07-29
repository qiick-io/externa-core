export type SidebarModuleSetting = {
    id: string;
    enabled: boolean;
    locked: boolean;
};

export type TransformPreset = {
    key: string;
    fit: 'contain' | 'cover' | 'inside' | 'outside';
    width: number | null;
    height: number | null;
    quality: number;
    without_enlargement: boolean;
    format: 'auto' | 'jpeg' | 'png' | 'webp';
};

export type ProjectSettingsForm = {
    name: string | null;
    description: string | null;
    url: string | null;
    default_language: string;
    content_locales: string[];
    default_content_locale: string;
    fallback_content_locales: string[];
    sidebar_modules: SidebarModuleSetting[];
    password_policy: 'weak' | 'medium' | 'strong';
    login_max_attempts: number;
    registration_enabled: boolean;
    default_user_role: string | null;
    email_verification_required: boolean;
    allowed_domains: string[];
    public_api_allowed_origins: string[];
    allowed_transformations: string[];
    preset_transformations: TransformPreset[];
    report_issue_url: string | null;
    report_bug_url: string | null;
    report_error_url: string | null;
    webhook_url: string | null;
    webhook_secret_configured: boolean;
};

export type SharedProjectSettings = {
    name: string | null;
    defaultLanguage: string;
    registrationEnabled: boolean;
    emailVerificationRequired: boolean;
    sidebarModules: SidebarModuleSetting[];
    reportIssueUrl: string | null;
    reportBugUrl: string | null;
    reportErrorUrl: string | null;
};

export type ProjectRoleOption = {
    id: number;
    name: string;
};
