# `@qiick/externa-sdk`

Typed TypeScript client for the Externa **Public CMS API** (`/api/v1`).

Happy paths: collections, items (incl. `sort`), files. Types are generated from
`resources/openapi/public-cms-v1.yaml` (same document as `GET /api/v1/openapi.json`).

## Install

```bash
npm install @qiick/externa-sdk
```

Publishing is maintainer-only; agents never `npm publish`.

## Server-side usage (API key stays off the browser)

```ts
import { createClient } from '@qiick/externa-sdk';

const externa = createClient({
  baseUrl: process.env.EXTERNA_URL!, // e.g. https://cms.example.com
  apiKey: process.env.EXTERNA_API_KEY!, // ek_…
});

const { data: items, meta } = await externa.listItems('posts', {
  sort: '-published_at,title',
  perPage: 10,
});
```

Call this from a Next.js / Nuxt server route, worker, or CLI — never embed the
API key in client bundles.

## Regenerate OpenAPI types

From the externa-core repo:

```bash
cd packages/sdk
npm ci
npm run generate   # writes src/generated/openapi.ts
npm run check      # freshness + tsc
```

CI fails when generated types drift from `resources/openapi/public-cms-v1.yaml`.

## Versioning

Package `0.y.z` tracks Public CMS API 1.x compatibility (additive). Breaking API
changes bump according to the project compatibility policy (#23). Proposed
initial version: **0.1.0**.
