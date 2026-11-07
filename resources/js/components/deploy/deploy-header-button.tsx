import { router, usePage } from '@inertiajs/react';
import { Rocket } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { deploy as deployRoute } from '@/routes/project/integrations';

/**
 * Global admin Deploy control when the user can trigger configured hooks.
 */
export function DeployHeaderButton() {
    const { t } = useTranslation();
    const { deploy } = usePage().props;
    const [isDeploying, setIsDeploying] = useState(false);

    if (!deploy?.canTrigger) {
        return null;
    }

    return (
        <Button
            type="button"
            variant="outline"
            disabled={isDeploying}
            data-test="header-deploy-button"
            onClick={() => {
                setIsDeploying(true);
                router.post(
                    deployRoute.url(),
                    {},
                    {
                        preserveScroll: true,
                        onFinish: () => setIsDeploying(false),
                    },
                );
            }}
        >
            <Rocket className="size-4" aria-hidden />
            {t('deploy.button')}
        </Button>
    );
}
