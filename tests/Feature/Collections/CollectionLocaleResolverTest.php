<?php

use App\Services\Settings\ProjectSettings;
use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Http\Request;

test('locale resolver uses query parameter when allowed', function () {
    $request = Request::create('/test', 'GET', ['locale' => 'it']);
    $request->headers->remove('Accept-Language');
    $resolver = new CollectionLocaleResolver($request, app(ProjectSettings::class));

    expect($resolver->resolve())->toBe('it');
});

test('locale resolver falls back to default content locale when query is invalid', function () {
    config(['app.locale' => 'en']);
    $request = Request::create('/test', 'GET', ['locale' => 'xx']);
    $request->headers->remove('Accept-Language');
    $resolver = new CollectionLocaleResolver($request, app(ProjectSettings::class));

    expect($resolver->resolve())->toBe('en')
        ->and($resolver->isAllowed('xx'))->toBeFalse();
});

test('assertRequestedLocaleAllowed aborts for disabled locale', function () {
    $request = Request::create('/test', 'GET', ['locale' => 'xx']);
    $resolver = new CollectionLocaleResolver($request, app(ProjectSettings::class));

    $resolver->assertRequestedLocaleAllowed();
})->throws(\Symfony\Component\HttpKernel\Exception\HttpException::class);
