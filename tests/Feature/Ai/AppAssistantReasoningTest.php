<?php

use App\Ai\Agents\AppAssistant;
use Laravel\Ai\Enums\Lab;

test('the assistant runs on the configured provider, local by default', function () {
    config(['ai.assistant.provider' => null]);
    expect((new AppAssistant)->provider())->toBe('local');

    config(['ai.assistant.provider' => 'anthropic']);
    expect((new AppAssistant)->provider())->toBe('anthropic');
});

test('real providers get the configured reasoning effort in their own format', function (string $provider, Lab|string $driver, array $expected) {
    config([
        'ai.assistant.provider' => $provider,
        "ai.providers.{$provider}.reasoning.effort" => 'medium',
    ]);

    expect((new AppAssistant)->providerOptions($driver))->toBe($expected);
})->with([
    'openai' => ['openai', Lab::OpenAI, ['reasoning' => ['effort' => 'medium', 'summary' => 'auto']]],
    'anthropic' => ['anthropic', 'anthropic', ['thinking' => ['type' => 'enabled', 'budget_tokens' => 8192]]],
    'gemini' => ['gemini', Lab::Gemini, ['generation_config' => ['thinking_level' => 'medium', 'thinking_summaries' => 'auto']]],
]);

test('the local model keeps its own reasoning unless an effort is configured', function () {
    config([
        'ai.assistant.provider' => 'local',
        'ai.providers.local.reasoning.effort' => null,
    ]);

    expect((new AppAssistant)->providerOptions('openai'))->toBe([]);

    config(['ai.providers.local.reasoning.effort' => 'high']);

    expect((new AppAssistant)->providerOptions('openai'))
        ->toBe(['reasoning' => ['effort' => 'high', 'summary' => 'auto']]);
});

test('an unknown effort sends nothing', function () {
    config([
        'ai.assistant.provider' => 'openai',
        'ai.providers.openai.reasoning.effort' => 'extreme',
    ]);

    expect((new AppAssistant)->providerOptions('openai'))->toBe([]);
});
