import type * as ts from 'typescript/lib/tsserverlibrary';

export interface PluginConfig {
  port: number;
}

export interface GetInlayHintsRequest {
  fileName: string;
  span: ts.TextSpan;
  preference: ts.UserPreferences;
}

export interface GetInlayHintsResponse {
  hints: ts.InlayHint[];
}
