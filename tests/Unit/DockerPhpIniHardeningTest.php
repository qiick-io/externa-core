<?php

it('pins the Docker base image to patched PHP 8.4.27+', function () {
    $dockerfile = (string) file_get_contents(base_path('Dockerfile'));

    expect($dockerfile)->toMatch('/ARG\s+PHP_VERSION=8\.4\.27\b/');
});

it('requires composer php ^8.4.27', function () {
    $composer = json_decode((string) file_get_contents(base_path('composer.json')), true, 512, JSON_THROW_ON_ERROR);

    expect($composer['require']['php'] ?? null)->toBe('^8.4.27');
});

it('hardens docker/php/php.ini for upload-progress RCEs without unlimited memory', function () {
    $ini = (string) file_get_contents(base_path('docker/php/php.ini'));

    expect($ini)
        ->toMatch('/^\s*session\.upload_progress\.enabled\s*=\s*0\s*$/m')
        ->toMatch('/^\s*session\.use_strict_mode\s*=\s*1\s*$/m')
        ->toMatch('/^\s*post_max_size\s*=\s*100M\s*$/m')
        ->toMatch('/^\s*upload_max_filesize\s*=\s*100M\s*$/m')
        ->toMatch('/^\s*max_input_vars\s*=\s*\d+\s*$/m')
        ->toMatch('/^\s*max_input_nesting_level\s*=\s*\d+\s*$/m')
        ->toMatch('/^\s*max_file_uploads\s*=\s*\d+\s*$/m')
        ->toMatch('/^\s*memory_limit\s*=\s*512M\s*$/m')
        ->not->toMatch('/^\s*memory_limit\s*=\s*-1\s*$/m');
});

it('does not inject PHP_VALUE or PHP_ADMIN_VALUE from nginx', function () {
    $nginx = (string) file_get_contents(base_path('docker/nginx/default.conf'));

    expect($nginx)
        ->not->toMatch('/^\s*fastcgi_param\s+PHP_(ADMIN_)?VALUE\b/mi')
        ->toContain('client_max_body_size 100M');
});
