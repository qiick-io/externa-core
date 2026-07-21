<?php

use App\Support\Http\LmStudioSseNormalizer;

test('maps lm studio reasoning_text events to openai summary_text events', function () {
    $chunk = <<<'SSE'
event: response.reasoning_text.delta
data: {"type":"response.reasoning_text.delta","delta":"Okay"}

event: response.reasoning_text.done
data: {"type":"response.reasoning_text.done"}

SSE;

    $normalized = LmStudioSseNormalizer::normalize($chunk);

    expect($normalized)
        ->toContain('response.reasoning_summary_text.delta')
        ->toContain('response.reasoning_summary_text.done')
        ->not->toContain('response.reasoning_text.');
});

test('leaves unrelated sse chunks untouched', function () {
    $chunk = 'data: {"type":"response.output_text.delta","delta":"hi"}\n\n';

    expect(LmStudioSseNormalizer::normalize($chunk))->toBe($chunk);
});
