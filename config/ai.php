<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default AI Provider Names
    |--------------------------------------------------------------------------
    |
    | Here you may specify which of the AI providers below should be the
    | default for AI operations when no explicit provider is provided
    | for the operation. This should be any provider defined below.
    |
    */

    'default' => env('AI_DEFAULT_PROVIDER', 'local'),
    'default_for_images' => 'gemini',
    'default_for_audio' => 'openai',
    'default_for_transcription' => 'openai',
    'default_for_embeddings' => 'openai',
    'default_for_reranking' => 'cohere',

    /*
    |--------------------------------------------------------------------------
    | Caching
    |--------------------------------------------------------------------------
    |
    | Below you may configure caching strategies for AI related operations
    | such as embedding generation. You are free to adjust these values
    | based on your application's available caching stores and needs.
    |
    */

    'caching' => [
        'embeddings' => [
            'cache' => false,
            'store' => env('CACHE_STORE', 'database'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Conversations
    |--------------------------------------------------------------------------
    */

    'conversations' => [
        'connection' => env('DB_CONNECTION'),
        'tables' => [
            'conversations' => 'agent_conversations',
            'messages' => 'agent_conversation_messages',
        ],
        // ponytail: skip LM title call — Str::limit from first prompt is enough
        'generate_title' => false,
    ],

    'remote_import_hosts' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('AI_REMOTE_IMPORT_HOSTS', '')),
    ))),

    // HMAC-SHA256 key for collection-import webhook (raw request body).
    'webhook_token' => env('AI_WEBHOOK_TOKEN'),

    // Previous token accepted until webhook_token_previous_expires_at (ISO 8601).
    'webhook_token_previous' => env('AI_WEBHOOK_TOKEN_PREVIOUS'),
    'webhook_token_previous_expires_at' => env('AI_WEBHOOK_TOKEN_PREVIOUS_EXPIRES_AT'),

    /*
    | Per-user daily budget (#275), counted from midnight in the app timezone. 0 = off.
    | The prompt cap and the token budget cover the chat and field translation. The `ai`
    | rate limiter counts chat requests per minute and per day (per day 0 = off).
    */
    'daily_prompt_limit' => (int) env('AI_DAILY_PROMPT_LIMIT', 0),
    'daily_token_budget' => (int) env('AI_DAILY_TOKEN_BUDGET', 0),

    'rate_limit' => [
        'per_minute' => (int) env('AI_RATE_LIMIT_PER_MINUTE', 30),
        'per_day' => (int) env('AI_RATE_LIMIT_PER_DAY', 0),
    ],

    /*
    | AI drafts for collection items (#210): off by default. The model falls back to the
    | default provider's text model when empty; max_tokens caps one draft response.
    */
    'item_drafts' => [
        'enabled' => (bool) env('AI_ITEM_DRAFTS', false),
        'model' => env('AI_ITEM_DRAFTS_MODEL'),
        'max_tokens' => (int) env('AI_ITEM_DRAFTS_MAX_TOKENS', 2000),
    ],

    'embeddings' => [
        'enabled' => (bool) env('AI_EMBEDDINGS_ENABLED', false),
    ],

    'mcp' => [
        'enabled' => (bool) env('AI_MCP_ENABLED', false),
        // When false, write/mutating MCP tools are not registered (even if AI_WRITE_TOOLS is on).
        // On by default (#766): an `mcp:write` key is the user's consent to MCP writes.
        'write_enabled' => (bool) env('AI_MCP_WRITE_ENABLED', true),
        // Stricter opt-in: park every MCP write for in-app approval, not only destructive ones.
        // For installs whose keys drive headless agents, where no MCP client asks before a call.
        'write_requires_approval' => (bool) env('AI_MCP_WRITE_REQUIRES_APPROVAL', false),
        'rate_limit_per_minute' => (int) env('AI_MCP_RATE_LIMIT_PER_MINUTE', 60),
        // Failed authentications per IP per minute before /mcp answers 429 (#441).
        'auth_failures_per_minute' => (int) env('AI_MCP_AUTH_FAILURES_PER_MINUTE', 20),
        // OAuth for remote MCP clients (#802): externa as its own authorization server, so a
        // connector registers itself (RFC 7591) and a user grants it narrow, revocable access on
        // a consent screen instead of pasting an API key. Off by default: until it is on, every
        // OAuth and discovery route answers 404 and `/mcp` accepts API keys only, as before.
        'oauth' => [
            'enabled' => (bool) env('AI_MCP_OAUTH_ENABLED', false),
            'access_token_ttl_minutes' => (int) env('AI_MCP_OAUTH_ACCESS_TOKEN_TTL_MINUTES', 60),
            'refresh_token_ttl_days' => (int) env('AI_MCP_OAUTH_REFRESH_TOKEN_TTL_DAYS', 30),
            // Unauthenticated client registrations per IP (IPv6: /64) per minute.
            'registrations_per_minute' => (int) env('AI_MCP_OAUTH_REGISTRATIONS_PER_MINUTE', 10),
            // Soft global cap on non-revoked clients (open DCR).
            'registrations_global_cap' => (int) env('AI_MCP_OAUTH_REGISTRATIONS_GLOBAL_CAP', 10000),
            // Clients with no successful authorisation are pruned after this many hours.
            'unused_client_retention_hours' => (int) env('AI_MCP_OAUTH_UNUSED_CLIENT_RETENTION_HOURS', 24),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Shared AI / MCP tool registry (#202 / #203)
    |--------------------------------------------------------------------------
    |
    | Write tools are on by default (#766). The env kill switch
    | (AI_WRITE_TOOLS / AI_TOOLS_WRITE_ENABLED) turns every write off. The
    | allowlist is write_allow (env) together with the project setting
    | ai.write_tools; when neither is set, every write tool is allowed.
    |
    | Destructive actions (deleting items, collections, fields or files,
    | emptying the trash, rolling back an AI turn, and every change to users,
    | roles or groups) are off by default (AI_TOOLS_DESTRUCTIVE_ENABLED) and,
    | once on, approved one call at a time. In-app writes ask the user first;
    | MCP writes run for an `mcp:write` key unless ai.mcp.write_requires_approval
    | is on, and destructive MCP calls always wait for approval (PendingToolCall).
    |
    */

    'tools' => [
        'enabled' => (bool) env('AI_TOOLS_ENABLED', true),
        // AI_WRITE_TOOLS is the #203 kill switch and wins when set; AI_TOOLS_WRITE_ENABLED (#202,
        // the standard's name) applies otherwise. Kept as in 1.4.0 so no upgraded .env changes
        // meaning: every install that had writes off stays off or is kept off by
        // AI_TOOLS_WRITE_ENABLED=false.
        'write_enabled' => (bool) env('AI_WRITE_TOOLS', env('AI_TOOLS_WRITE_ENABLED', true)),
        'destructive_enabled' => (bool) env('AI_TOOLS_DESTRUCTIVE_ENABLED', false),
        // Empty = every write tool (unless the ai.write_tools project setting narrows it).
        'write_allow' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('AI_TOOLS_WRITE_ALLOW', '')),
        ))),
        'approval_ttl_minutes' => (int) env('AI_TOOLS_APPROVAL_TTL', 15),
        'audit_retention_days' => (int) env('AI_TOOLS_AUDIT_RETENTION_DAYS', 90),
        'redact_keys' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env(
                'AI_TOOLS_REDACT_KEYS',
                'auth_bearer,auth_header,authorization,bearer,password,token,api_key,apikey,secret,client_secret,email,phone,telephone,ssn,social_security_number,credit_card,card_number,cvv',
            )),
        ))),
        'allow' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('AI_TOOLS_ALLOW', '')),
        ))),
        'deny' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('AI_TOOLS_DENY', '')),
        ))),
    ],

    /*
    |--------------------------------------------------------------------------
    | AI Providers
    |--------------------------------------------------------------------------
    |
    | Below are each of your AI providers defined for this application. Each
    | represents an AI provider and API key combination which can be used
    | to perform tasks like text, image, and audio creation via agents.
    |
    */

    /*
    |--------------------------------------------------------------------------
    | Assistant
    |--------------------------------------------------------------------------
    |
    | The provider the in-app assistant (AppAssistant) runs on. Each provider
    | below may set `reasoning.effort` (low, medium or high) and the
    | `context_window` (tokens) the Assistant shows next to its usage.
    |
    */

    'assistant' => [
        'provider' => env('AI_ASSISTANT_PROVIDER', 'local'),
    ],

    'providers' => [
        'anthropic' => [
            'driver' => 'anthropic',
            'key' => env('ANTHROPIC_API_KEY'),
            'url' => env('ANTHROPIC_URL', 'https://api.anthropic.com/v1'),
            'reasoning' => ['effort' => env('ANTHROPIC_REASONING_EFFORT', 'medium')],
            'context_window' => (int) env('ANTHROPIC_CONTEXT_WINDOW', 200000),
        ],

        'azure' => [
            'driver' => 'azure',
            'key' => env('AZURE_OPENAI_API_KEY'),
            'url' => env('AZURE_OPENAI_URL'),
            'api_version' => env('AZURE_OPENAI_API_VERSION', '2025-04-01-preview'),
            'deployment' => env('AZURE_OPENAI_DEPLOYMENT', 'gpt-4o'),
            'embedding_deployment' => env('AZURE_OPENAI_EMBEDDING_DEPLOYMENT', 'text-embedding-3-small'),
            'image_deployment' => env('AZURE_OPENAI_IMAGE_DEPLOYMENT', 'gpt-image-1'),
        ],

        'bedrock' => [
            'driver' => 'bedrock',
            'region' => env('AWS_BEDROCK_REGION', 'us-east-1'),
            'key' => env('AWS_BEARER_TOKEN_BEDROCK'),
            'access_key_id' => env('AWS_ACCESS_KEY_ID'),
            'secret_access_key' => env('AWS_SECRET_ACCESS_KEY'),
            'session_token' => env('AWS_SESSION_TOKEN'),
            'use_default_credential_provider' => env('AWS_USE_DEFAULT_CREDENTIALS', true),
        ],

        'cohere' => [
            'driver' => 'cohere',
            'key' => env('COHERE_API_KEY'),
        ],

        'deepseek' => [
            'driver' => 'deepseek',
            'key' => env('DEEPSEEK_API_KEY'),
        ],

        'eleven' => [
            'driver' => 'eleven',
            'key' => env('ELEVENLABS_API_KEY'),
        ],

        'gemini' => [
            'driver' => 'gemini',
            'key' => env('GEMINI_API_KEY'),
            'url' => env('GEMINI_URL', 'https://generativelanguage.googleapis.com/v1beta/'),
            'reasoning' => ['effort' => env('GEMINI_REASONING_EFFORT', 'medium')],
            'context_window' => (int) env('GEMINI_CONTEXT_WINDOW', 1048576),
        ],

        'groq' => [
            'driver' => 'groq',
            'key' => env('GROQ_API_KEY'),
        ],

        'jina' => [
            'driver' => 'jina',
            'key' => env('JINA_API_KEY'),
        ],

        'mistral' => [
            'driver' => 'mistral',
            'key' => env('MISTRAL_API_KEY'),
        ],

        'ollama' => [
            'driver' => 'ollama',
            'key' => env('OLLAMA_API_KEY', ''),
            'url' => env('OLLAMA_URL', 'http://localhost:11434'),
        ],

        'openai' => [
            'driver' => 'openai',
            'key' => env('OPENAI_API_KEY'),
            'url' => env('OPENAI_URL', 'https://api.openai.com/v1'),
            'reasoning' => ['effort' => env('OPENAI_REASONING_EFFORT', 'medium')],
            'context_window' => (int) env('OPENAI_CONTEXT_WINDOW', 400000),
        ],

        // LM Studio / vLLM / other OpenAI-compatible gateways.
        // laravel/ai v0.7.x has no openai-compatible driver name; openai + url works the same.
        'local' => [
            'driver' => 'openai',
            'key' => env('LOCAL_AI_API_KEY', ''),
            'url' => env('LOCAL_AI_URL', 'http://127.0.0.1:1234/v1'),
            // Unset: the local model keeps its own reasoning behaviour.
            'reasoning' => ['effort' => env('LOCAL_AI_REASONING_EFFORT')],
            'context_window' => (int) env('LOCAL_AI_CONTEXT_WINDOW', 131072),
            'models' => [
                'text' => [
                    'default' => env('LOCAL_AI_MODEL', 'local-model'),
                    // Field translate is a blocking POST (no SSE). Prefer a non-thinking
                    // instruct model so nginx fastcgi_read_timeout (~60s default) does not 504.
                    'translate' => env('LOCAL_AI_TRANSLATE_MODEL'),
                ],
            ],
        ],

        'openrouter' => [
            'driver' => 'openrouter',
            'key' => env('OPENROUTER_API_KEY'),
        ],

        'voyageai' => [
            'driver' => 'voyageai',
            'key' => env('VOYAGEAI_API_KEY'),
        ],

        'xai' => [
            'driver' => 'xai',
            'key' => env('XAI_API_KEY'),
        ],
    ],

];
