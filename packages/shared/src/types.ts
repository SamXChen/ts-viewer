import { PluginHealthKind } from './constants';

export interface PluginConfig {
  port: number;
}

export interface PluginHealthResponse {
  kind: typeof PluginHealthKind;
  port: number;
  projectCount: number;
}

export interface GetTypeRequest {
  fileName: string;
  position: number;
}

export interface GetTypeSuccessResponse {
  type: 'success';
  data: string;
}

export interface GetTypeErrorResponse {
  type: 'error';
  data: string;
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
