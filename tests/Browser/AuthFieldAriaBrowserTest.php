<?php

it('links login field errors through aria-describedby', function () {
    $page = visit('/login');

    $page->assertSee('Skip to content')
        ->assertPresent('#main-content')
        // Fortify only validates `email` as a required string, so an email-field error
        // comes from failed credentials (auth.failed), not from a malformed address.
        ->fill('email', 'nobody@example.com')
        ->fill('password', 'wrong-password')
        ->click('[data-test="login-button"]')
        ->wait(1.5)
        ->assertPresent('#email-error')
        ->assertScript(
            <<<'JS'
() => {
  const input = document.getElementById('email');
  const error = document.getElementById('email-error');
  if (!input || !error) {
    return false;
  }
  if (input.getAttribute('aria-invalid') !== 'true') {
    return false;
  }
  const describedBy = input.getAttribute('aria-describedby') || '';
  return describedBy.split(/\s+/).includes('email-error') && error.getAttribute('role') === 'alert';
}
JS
            ,
            true,
        )
        ->assertNoAccessibilityIssues(1)
        ->assertNoJavaScriptErrors();
});
