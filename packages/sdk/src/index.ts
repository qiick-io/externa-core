export {
  ExternaApiError,
  ExternaClient,
  createClient,
  type CollectionItemResource,
  type CollectionResource,
  type CollectionsListResponse,
  type ExternaClientOptions,
  type FileResource,
  type FilesListResponse,
  type ItemsListResponse,
  type ListFilesParams,
  type ListItemsParams,
} from './client.js';

export type { components, operations, paths } from './generated/openapi.js';
