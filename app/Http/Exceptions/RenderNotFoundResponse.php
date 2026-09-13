<?php

namespace App\Http\Exceptions;

use App\Models\Collection;
use App\Models\CollectionItem;
use App\Support\Auth\HomePath;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Web 404s: guests → login; auth → Inertia shell or smart redirect for missing models.
 */
final class RenderNotFoundResponse
{
    public static function render(NotFoundHttpException $exception, Request $request): ?Response
    {
        if (self::shouldUseDefaultResponse($request)) {
            return null;
        }

        if ($request->user() === null) {
            return redirect()->guest(route('login'));
        }

        $redirect = self::redirectForMissingModel($exception, $request);
        if ($redirect !== null) {
            return $redirect;
        }

        return Inertia::render('errors/not-found', [
            'status' => 404,
            'homeUrl' => HomePath::for($request->user()),
        ])->toResponse($request)->setStatusCode(404);
    }

    private static function shouldUseDefaultResponse(Request $request): bool
    {
        return $request->is('api/*')
            || $request->is('graphql')
            || $request->is('api/graphql')
            || $request->expectsJson();
    }

    private static function redirectForMissingModel(
        NotFoundHttpException $exception,
        Request $request,
    ): ?Response {
        $previous = $exception->getPrevious();
        if (! $previous instanceof ModelNotFoundException) {
            return null;
        }

        $model = $previous->getModel();

        if ($model === Collection::class) {
            return redirect()
                ->route('collections.index')
                ->with('error', 'This collection no longer exists.');
        }

        if ($model === CollectionItem::class) {
            $collection = $request->route('collection');
            if ($collection instanceof Collection) {
                return redirect()
                    ->route('collections.items.index', $collection)
                    ->with('error', 'This item no longer exists.');
            }
        }

        return null;
    }
}
