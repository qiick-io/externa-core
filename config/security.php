<?php

/**
 * Browser defense headers for the admin (Inertia/web) stack.
 *
 * HSTS belongs on the reverse proxy. CSP is pragmatic for Vite + Echo/Reverb;
 * override the full policy with SECURITY_CSP when needed.
 */
return [

    'enabled' => (bool) env('SECURITY_HEADERS_ENABLED', true),

    'x_frame_options' => env('SECURITY_X_FRAME_OPTIONS', 'DENY'),

    'referrer_policy' => env('SECURITY_REFERRER_POLICY', 'strict-origin-when-cross-origin'),

    /*
    | Restrict powerful browser features on the admin UI. The microphone stays
    | allowed for self: AI chat voice input uses SpeechRecognition. Use
    | `microphone=()` in SECURITY_PERMISSIONS_POLICY to turn voice input off.
    */
    'permissions_policy' => env(
        'SECURITY_PERMISSIONS_POLICY',
        'camera=(), microphone=(self), geolocation=(), payment=(), usb=()',
    ),

    /*
    | Full Content-Security-Policy. Null = built from Vite/Reverb-friendly defaults.
    */
    'csp' => env('SECURITY_CSP'),

];
