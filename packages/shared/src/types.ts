import { PluginHealthKind } from './constants';

export interface PluginConfig {
  readonly port: number;
  readonly instanceId?: string;
}

export interface PluginHealthResponse {
  readonly kind: typeof PluginHealthKind;
  readonly port: number;
  readonly projectCount: number;
  readonly instanceId?: string;
}

export interface GetTypeRequest {
  readonly fileName: string;
  readonly position: number;
}

export interface GetTypeSuccessResponse {
  readonly type: 'success';
  readonly data: string;
}

export interface GetTypeErrorResponse {
  readonly type: 'error';
  readonly data: string;
}

export type GetTypeResponse = GetTypeSuccessResponse | GetTypeErrorResponse;

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function createErrorResponse(error: unknown): GetTypeErrorResponse {
  return {
    type: 'error',
    data: getErrorMessage(error),
  };
}
