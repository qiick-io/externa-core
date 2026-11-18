<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| AI model catalog (#370)
|--------------------------------------------------------------------------
|
| A short, curated list of models per provider (the provider key in config/ai.php). The ids
| are the defaults the installed laravel/ai release (v1.3) ships for each provider, so they
| exist on the provider's API. Status:
|
| - recommended: reliable tool calling; the safe choice for the assistant.
| - supported:   works, but smaller or less tested; small models may report tool calls
|                that never ran.
| - deprecated:  still runs, but is being retired; AI settings warn when one is configured.
|
| A model that is not listed here (LOCAL_AI_MODEL, an Ollama model, a custom id) stays
| allowed and is shown as "unverified". Capabilities: tools, vision, embeddings.
|
| To retire a model, keep its entry and set 'status' => 'deprecated'.
|
*/

return [
    'models' => [
        ['provider' => 'anthropic', 'model' => 'claude-sonnet-5-5', 'capabilities' => ['tools', 'vision'], 'status' => 'recommended'],
        ['provider' => 'anthropic', 'model' => 'claude-opus-5-5', 'capabilities' => ['tools', 'vision'], 'status' => 'recommended'],
        ['provider' => 'anthropic', 'model' => 'claude-haiku-5-5', 'capabilities' => ['tools', 'vision'], 'status' => 'supported'],

        ['provider' => 'openai', 'model' => 'gpt-6.1-sol', 'capabilities' => ['tools', 'vision'], 'status' => 'recommended'],
        ['provider' => 'openai', 'model' => 'gpt-6-astra', 'capabilities' => ['tools', 'vision'], 'status' => 'recommended'],
        ['provider' => 'openai', 'model' => 'gpt-6-luna', 'capabilities' => ['tools'], 'status' => 'supported'],
        ['provider' => 'openai', 'model' => 'text-embedding-3-small', 'capabilities' => ['embeddings'], 'status' => 'recommended'],

        ['provider' => 'gemini', 'model' => 'gemini-3.8-flash', 'capabilities' => ['tools', 'vision'], 'status' => 'recommended'],
        ['provider' => 'gemini', 'model' => 'gemini-3.1-flash-lite', 'capabilities' => ['tools'], 'status' => 'supported'],
        ['provider' => 'gemini', 'model' => 'gemini-embedding-2', 'capabilities' => ['embeddings'], 'status' => 'supported'],

        ['provider' => 'mistral', 'model' => 'mistral-large-2512', 'capabilities' => ['tools'], 'status' => 'supported'],
        ['provider' => 'mistral', 'model' => 'mistral-embed-2312', 'capabilities' => ['embeddings'], 'status' => 'supported'],
        ['provider' => 'deepseek', 'model' => 'deepseek-v4-pro', 'capabilities' => ['tools'], 'status' => 'supported'],
        ['provider' => 'xai', 'model' => 'grok-4.7', 'capabilities' => ['tools'], 'status' => 'supported'],
        ['provider' => 'groq', 'model' => 'openai/gpt-oss-120b', 'capabilities' => ['tools'], 'status' => 'supported'],
        ['provider' => 'cohere', 'model' => 'embed-v4.0', 'capabilities' => ['embeddings'], 'status' => 'supported'],
        ['provider' => 'voyageai', 'model' => 'voyage-4', 'capabilities' => ['embeddings'], 'status' => 'supported'],
        ['provider' => 'ollama', 'model' => 'nomic-embed-text', 'capabilities' => ['embeddings'], 'status' => 'supported'],
    ],
];
