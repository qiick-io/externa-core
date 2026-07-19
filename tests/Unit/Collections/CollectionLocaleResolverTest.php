<?php

use App\Support\Collections\CollectionLocaleResolver;
use Illuminate\Http\Request;

test('locale resolver uses query parameter when allowed', function () {
    $request = Request::create('/test', 'GET', ['locale' => 'it']);
    $resolver = new CollectionLocaleResolver($request);

    expect($resolver->resolve())->toBe('it');
});

test('locale resolver falls back to app locale when query is invalid', function () {
    config(['app.locale' => 'en']);
    $request = Request::create('/test', 'GET', ['locale' => 'xx']);
    $resolver = new CollectionLocaleResolver($request);

    expect($resolver->resolve())->toBe('en');
});
