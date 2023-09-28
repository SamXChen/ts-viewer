import type { PluginConfig } from '@ts-faker/shared';
import getPort from 'get-port';
import { pluginId, typeScriptExtensionId } from './constants';
import * as vscode from 'vscode';

declare class ApiV0 {
  configurePlugin(pluginId: string, configuration: unknown): void;
}

interface Api {
  getAPI(version: 0): ApiV0 | undefined;
}

export async function getPluginConfig(defaultPort: number) {
  const extension = vscode.extensions.getExtension(typeScriptExtensionId);
  if (!extension) {
    return;
  }

  await extension.activate();
  const extApi = extension.exports as Api | undefined;
  if (!extApi?.getAPI) {
    return;
  }

  const api = extApi.getAPI(0);
  if (!api) {
    return;
  }

  const port = await getPort({ port: defaultPort });
  const config: Partial<PluginConfig> = {
    port,
  };

  api.configurePlugin(pluginId, config);
  return config;
}
