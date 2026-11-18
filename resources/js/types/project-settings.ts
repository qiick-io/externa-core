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
    two_factor_required: boolean;
    allowed_domains: string[];
    public_api_allowed_origins: string[];
    allowed_transformations: string[];
    preset_transformations: TransformPreset[];
    report_issue_url: string | null;
    report_bug_url: string | null;
    report_error_url: string | null;
    webhook_url: string | null;
    webhook_secret_configured: boolean;
    notifier_slack_webhook_url: string | null;
    notifier_telegram_chat_id: string | null;
    notifier_telegram_bot_token_configured: boolean;
    notifier_event_types: string[];
    deploy_hooks: DeployHookFormEntry[];
    deploy_on_publish: boolean;
    oidc_enabled: boolean;
    oidc_issuer: string | null;
    oidc_client_id: string | null;
    oidc_client_secret_configured: boolean;
    oidc_button_label: string | null;
    oidc_jit_provisioning: boolean;
    preview_url_default: string | null;
    revision_retention_count: number | null;
    revision_retention_days: number | null;
    files_max_upload_bytes: number | null;
    chat_max_upload_bytes: number | null;
    upload_allowed_mimes: string[] | null;
    upload_allowed_extensions: string[] | null;
    upload_allow_svg: boolean;
};

export type WebhookEventCatalogEntry = {
    type: string;
    description: string;
};

export type WebhookDeliveryEntry = {
    event_id: string;
    type: string;
    outcome: 'success' | 'failed';
    status: number | null;
    message: string | null;
    attempts: number;
    at: string;
};

export type WebhookDeliverySummary = {
    last_success: WebhookDeliveryEntry | null;
    last_error: WebhookDeliveryEntry | null;
    recent: WebhookDeliveryEntry[];
};

type DeployHookFormEntry = {
    id: string;
    name: string;
    url_configured: boolean;
};

export type DeployLastRun = {
    hook_id: string;
    hook_name: string;
    /** `success` or `failed`; kept as string because older stored rows may hold other values. */
    outcome: string;
    status: number | null;
    message: string | null;
    source: string;
    hook_ids: string[];
    at: string;
};

export type SharedDeployProps = {
    canTrigger: boolean;
    hooks: Array<{ id: string; name: string }>;
    lastRun: DeployLastRun | null;
};

export type SharedProjectSettings = {
    name: string | null;
    defaultLanguage: string;
    isRegistrationEnabled: boolean;
    isEmailVerificationRequired: boolean;
    passwordPolicy: 'weak' | 'medium' | 'strong';
    sidebarModules: SidebarModuleSetting[];
    reportIssueUrl: string | null;
    reportBugUrl: string | null;
    reportErrorUrl: string | null;
    filesMaxUploadBytes: number | null;
    chatMaxUploadBytes: number | null;
};

export type ProjectRoleOption = {
    id: number;
    name: string;
};
