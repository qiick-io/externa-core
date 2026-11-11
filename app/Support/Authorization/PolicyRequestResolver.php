<?php

declare(strict_types=1);

namespace App\Support\Authorization;

use App\Models\User;
use Illuminate\Http\Request;

/**
 * Hands policies the request that request-aware services (collection ACL, API key scopes) read.
 *
 * Those services resolve the actor from the request itself: its `apiAccess` attribute first,
 * then `$request->user()`. A policy receives the gate user instead, so this returns the current
 * request when it carries that user, and otherwise a copy that resolves the gate user (queued
 * AI runs, `Gate::forUser()` for someone else, no HTTP request at all).
 */
final class PolicyRequestResolver
{
    public function forUser(?User $user): Request
    {
        $request = app()->bound('request') ? app('request') : Request::create('/');
        $requestUser = $request->user();

        $isSameActor = $user === null
            ? $requestUser === null
            : $requestUser instanceof User && $requestUser->is($user);
        if ($isSameActor) {
            return $request;
        }

        $actorRequest = $request->duplicate();
        $actorRequest->setUserResolver(static fn (): ?User => $user);
        // The gate user is someone else than the request's actor: judge that user, not the
        // request's API key.
        $actorRequest->attributes->remove('apiAccess');

        return $actorRequest;
    }
}
