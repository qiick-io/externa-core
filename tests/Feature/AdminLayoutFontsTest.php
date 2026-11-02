<?php

beforeEach(function () {
    $this->withoutVite();
});

test('rendered admin layout HTML does not load fonts from bunny.net', function () {
    $this->get(route('login'))
        ->assertOk()
        ->assertDontSee('fonts.bunny.net', false);
});
