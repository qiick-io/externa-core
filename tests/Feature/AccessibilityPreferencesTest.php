<?php

test('accessibility cookies stamp html classes before paint', function () {
    $html = $this->withUnencryptedCookie('accessibility_high_contrast', '1')
        ->withUnencryptedCookie('accessibility_reduce_motion', '1')
        ->get(route('login'))
        ->assertOk()
        ->getContent();

    expect($html)->toContain('high-contrast')
        ->and($html)->toContain('reduce-motion');
});

test('accessibility cookies off leave html without a11y classes', function () {
    $html = $this->get(route('login'))
        ->assertOk()
        ->getContent();

    expect($html)->not->toContain('high-contrast')
        ->and($html)->not->toContain('reduce-motion');
});
