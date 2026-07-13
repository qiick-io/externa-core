type WayfinderFormProps = {
    action: string;
    method: string;
};

type WayfinderRouteWithForm<TArgs> = {
    form?: (args: TArgs) => WayfinderFormProps;
    url: (args: TArgs) => string;
    patch?: (args: TArgs) => { url: string; method: 'patch' };
    post?: (args: TArgs) => { url: string; method: 'post' };
};

export function wayfinderInertiaFormProps<TArgs>(
    route: WayfinderRouteWithForm<TArgs>,
    args: TArgs,
    fallbackMethod: 'post' | 'patch',
): WayfinderFormProps {
    if (typeof route.form === 'function') {
        return route.form(args);
    }

    if (fallbackMethod === 'patch' && typeof route.patch === 'function') {
        const patchRoute = route.patch(args);

        return {
            action: patchRoute.url,
            method: patchRoute.method,
        };
    }

    if (fallbackMethod === 'post' && typeof route.post === 'function') {
        const postRoute = route.post(args);

        return {
            action: postRoute.url,
            method: postRoute.method,
        };
    }

    return {
        action: route.url(args),
        method: fallbackMethod,
    };
}
