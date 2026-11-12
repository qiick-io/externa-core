import type { ProjectSettingsForm } from '@/types';

/** A deploy hook row being edited; `url` stays empty unless the user types a new one. */
export type DeployHookDraft = {
    clientKey: string;
    id?: string;
    name: string;
    url: string;
    url_configured: boolean;
};

export type IntegrationsProjectSettings = Pick<
    ProjectSettingsForm,
    | 'webhook_url'
    | 'webhook_secret_configured'
    | 'notifier_slack_webhook_url'
    | 'notifier_telegram_bot_token_configured'
    | 'notifier_telegram_chat_id'
    | 'notifier_event_types'
    | 'deploy_hooks'
    | 'deploy_on_publish'
>;

/** Local state of the integrations settings form, posted through hidden inputs and fields. */
export type IntegrationsFormState = {
    webhook_url: string;
    webhook_secret: string;
    notifier_slack_webhook_url: string;
    notifier_telegram_bot_token: string;
    notifier_telegram_chat_id: string;
    notifier_event_types: string[];
    deploy_hooks: DeployHookDraft[];
    deploy_on_publish: boolean;
};

/**
 * Builds the form state from the server props. Secrets (webhook secret, Telegram token,
 * deploy hook URLs) are never sent back, so their inputs start empty.
 */
export function buildFormState(
    project: IntegrationsProjectSettings,
): IntegrationsFormState {
    return {
        webhook_url: project.webhook_url ?? '',
        webhook_secret: '',
        notifier_slack_webhook_url: project.notifier_slack_webhook_url ?? '',
        notifier_telegram_bot_token: '',
        notifier_telegram_chat_id: project.notifier_telegram_chat_id ?? '',
        notifier_event_types: project.notifier_event_types ?? [],
        deploy_hooks: (project.deploy_hooks ?? []).map(
            (hook, index): DeployHookDraft => ({
                clientKey: hook.id || `new-${index}`,
                id: hook.id,
                name: hook.name,
                url: '',
                url_configured: hook.url_configured,
            }),
        ),
        deploy_on_publish: project.deploy_on_publish ?? false,
    };
}
