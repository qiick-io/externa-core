<?php

namespace App\GraphQL\Concerns;

use App\Enums\CollectionPermissionActionEnum;
use App\Models\Collection;
use App\Models\CollectionItem;
use App\Policies\CollectionItemPolicy;
use App\Policies\CollectionPolicy;
use Illuminate\Support\Facades\Gate;

trait AuthorizesGraphqlCollectionTrait
{
    protected function findCollection(string $slug): Collection
    {
        $collection = Collection::query()->where('slug', $slug)->first();
        if ($collection === null) {
            abort(404, __('Collection not found.'));
        }

        return $collection;
    }

    /**
     * Entry gate: role ACL ∩ API key scopes via {@see CollectionPolicy}.
     *
     * Denials stay an `abort(403, …)`: Lighthouse renders an HttpException differently from the
     * AuthorizationException `Gate::authorize()` would throw.
     */
    protected function authorize(Collection $collection, CollectionPermissionActionEnum $action): void
    {
        $response = Gate::forUser(request()->user())->inspect($action->itemsAbility(), $collection);
        abort_unless($response->allowed(), 403, (string) $response->message());
    }

    /**
     * Item inside the actor's read filter via {@see CollectionItemPolicy::view()} (empty 404 otherwise).
     */
    protected function authorizeItemRead(Collection $collection, CollectionItem $item): void
    {
        abort_unless(Gate::forUser(request()->user())->allows('view', [$item, $collection]), 404);
    }

    /**
     * Item inside the actor's write filter via {@see CollectionItemPolicy} (403 with its message).
     */
    protected function authorizeItemWrite(string $ability, Collection $collection, CollectionItem $item): void
    {
        $response = Gate::forUser(request()->user())->inspect($ability, [$item, $collection]);
        abort_unless($response->allowed(), 403, (string) $response->message());
    }
}
