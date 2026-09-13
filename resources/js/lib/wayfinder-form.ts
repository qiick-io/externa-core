type InertiaFormMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type WayfinderFormProps = {
    action: string;
    method: InertiaFormMethod;
};

type WayfinderRouteWithForm<TArgs> = {
    form?: (args: TArgs) => WayfinderFormProps;
    url: (args: TArgs) => string;
    patch?: (args: TArgs) => { url: string; method: 'patch' };
    post?: (args: TArgs) => { url: string; method: 'post' };
    put?: (args: TArgs) => { url: string; method: 'put' };
    delete?: (args: TArgs) => { url: string; method: 'delete' };
};

/**
 * Builds Inertia `<Form>` props from a Wayfinder route, preferring generated `.form()` helpers.
 *
 * @param route - Wayfinder route object with optional `form`, `patch`, or `post` helpers
 * @param args - Route parameters passed to the Wayfinder helpers
 * @param fallbackMethod - HTTP method when no generated form helper exists
 * @returns `action` and `method` suitable for Inertia forms
 */
export function wayfinderInertiaFormProps<TArgs>(
    route: WayfinderRouteWithForm<TArgs>,
    args: TArgs,
    fallbackMethod: 'post' | 'patch' | 'put' | 'delete',
): WayfinderFormProps {
    if (typeof route.form === 'function') {
        const formProps = route.form(args);

        return {
            action: formProps.action,
            method: formProps.method as InertiaFormMethod,
        };
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

    if (fallbackMethod === 'put' && typeof route.put === 'function') {
        const putRoute = route.put(args);

        return {
            action: putRoute.url,
            method: putRoute.method,
        };
    }

    if (fallbackMethod === 'delete' && typeof route.delete === 'function') {
        const deleteRoute = route.delete(args);

        return {
            action: deleteRoute.url,
            method: deleteRoute.method,
        };
    }

    return {
        action: route.url(args),
        method: fallbackMethod,
    };
}
