export interface PluginConfig {
  port: number;
}

export interface PluginHealthResponse {
  kind: 'ts-viewer-health';
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
