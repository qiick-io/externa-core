<?php

it('keeps a zoom-friendly viewport meta without maximum-scale locks', function () {
    $blade = file_get_contents(dirname(__DIR__, 2).'/resources/views/app.blade.php');

    expect($blade)->toMatch('/name=["\']viewport["\']/')
        ->and($blade)->toContain('width=device-width')
        ->and($blade)->toContain('initial-scale=1')
        ->and($blade)->not->toContain('maximum-scale')
        ->and($blade)->not->toContain('user-scalable=no');
});
