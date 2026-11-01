import type { components, operations } from './generated/openapi.js';

export type CollectionResource = components['schemas']['CollectionResource'];
export type CollectionItemResource = components['schemas']['CollectionItemResource'];
export type FileResource = components['schemas']['FileResource'];
export type ItemsListResponse = components['schemas']['ItemsListResponse'];
export type CollectionsListResponse = components['schemas']['CollectionsListResponse'];
export type FilesListResponse = components['schemas']['FilesListResponse'];

export type ExternaClientOptions = {
  /** App origin only (no `/api/v1`), e.g. `https://cms.example.com` */
  baseUrl: string;
  /** Server-side API key (`ek_…`). Never ship this to a browser. */
  apiKey?: string;
  fetch?: typeof fetch;
};

export class ExternaApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ExternaApiError';
    this.status = status;
    this.body = body;
  }
}

export type ListItemsParams = {
  page?: number;
  perPage?: number;
  sort?: string;
  locale?: string;
  include?: string;
  includeAllTranslations?: boolean;
  filter?: Record<string, unknown>;
};

export type ListFilesParams = {
  page?: number;
  perPage?: number;
};

type ListItemsQuery = NonNullable<operations['listItems']['parameters']['query']>;

/**
 * Minimal Public CMS REST client (collections / items / files).
 * Intended for server-side use with an API key.
 */
export class ExternaClient {
  readonly #baseUrl: string;
  readonly #apiKey: string | undefined;
  readonly #fetch: typeof fetch;

  constructor(options: ExternaClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  listCollections(): Promise<CollectionsListResponse> {
    return this.#request('GET', '/collections');
  }

  getCollection(slug: string): Promise<{ data: CollectionResource }> {
    return this.#request('GET', `/collections/${encodeURIComponent(slug)}`);
  }

  listItems(slug: string, params: ListItemsParams = {}): Promise<ItemsListResponse> {
    const query: ListItemsQuery & Record<string, string> = {};
    if (params.page !== undefined) query.page = params.page;
    if (params.perPage !== undefined) query.per_page = params.perPage;
    if (params.sort !== undefined) query.sort = params.sort;
    if (params.locale !== undefined) query.locale = params.locale;
    if (params.include !== undefined) query.include = params.include;
    if (params.includeAllTranslations !== undefined) {
      query.include_all_translations = params.includeAllTranslations;
    }

    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      search.set(key, String(value));
    }
    if (params.filter) {
      appendDeepObject(search, 'filter', params.filter);
    }

    const qs = search.toString();
    return this.#request(
      'GET',
      `/collections/${encodeURIComponent(slug)}/items${qs ? `?${qs}` : ''}`,
    );
  }

  getItem(slug: string, id: number | string): Promise<{ data: CollectionItemResource }> {
    return this.#request(
      'GET',
      `/collections/${encodeURIComponent(slug)}/items/${encodeURIComponent(String(id))}`,
    );
  }

  listFiles(params: ListFilesParams = {}): Promise<FilesListResponse> {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set('page', String(params.page));
    if (params.perPage !== undefined) search.set('per_page', String(params.perPage));
    const qs = search.toString();
    return this.#request('GET', `/files${qs ? `?${qs}` : ''}`);
  }

  getFile(id: number | string): Promise<{ data: FileResource }> {
    return this.#request('GET', `/files/${encodeURIComponent(String(id))}`);
  }

  async #request<T>(method: string, path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.#apiKey) {
      headers.Authorization = `Bearer ${this.#apiKey}`;
    }

    const response = await this.#fetch(`${this.#baseUrl}/api/v1${path}`, {
      method,
      headers,
    });

    const text = await response.text();
    let body: unknown = null;
    if (text !== '') {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      throw new ExternaApiError(
        `Externa API ${method} ${path} failed with ${response.status}`,
        response.status,
        body,
      );
    }

    return body as T;
  }
}

export function createClient(options: ExternaClientOptions): ExternaClient {
  return new ExternaClient(options);
}

function appendDeepObject(
  search: URLSearchParams,
  prefix: string,
  value: unknown,
): void {
  if (value === null || value === undefined) {
    search.set(prefix, '');
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      appendDeepObject(search, `${prefix}[${index}]`, entry);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      appendDeepObject(search, `${prefix}[${key}]`, entry);
    }
    return;
  }
  search.set(prefix, String(value));
}
