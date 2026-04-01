import type { PluginConfig, PluginHealthResponse } from '@ts-viewer/shared';
import axios from 'axios';
import getPort from 'get-port';
import { pluginId, typeScriptExtensionId } from './constants';
import * as vscode from 'vscode';

declare class ApiV0 {
  configurePlugin(pluginId: string, configuration: unknown): void;
}

interface Api {
  getAPI(version: 0): ApiV0 | undefined;
}

const HealthCheckTimeoutMs = 300;
const HealthRetryCount = 8;
const HealthRetryDelayMs = 150;

export interface PluginConnection extends vscode.Disposable {
  getPort(): number | undefined;
  ensureConnected(reason: string): Promise<number | undefined>;
  recover(reason: string): Promise<number | undefined>;
  getOutputChannel(): vscode.OutputChannel;
}

export async function createPluginConnection(defaultPort: number) {
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

  const connection = new PluginConnectionManager(api, defaultPort);
  void connection.ensureConnected('activate');
  return connection;
}

class PluginConnectionManager implements PluginConnection {
  private currentPort: number | undefined;
  private readonly outputChannel = vscode.window.createOutputChannel('TS Viewer Connection');
  private readonly subscriptions: vscode.Disposable[] = [];
  private pendingConfigure: Promise<number | undefined> = Promise.resolve(undefined);
  private isDisposed = false;

  constructor(
    private readonly api: ApiV0,
    private readonly defaultPort: number,
  ) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.ensureConnected('workspace folders changed');
      }),
    );
  }

  getPort() {
    return this.currentPort;
  }

  getOutputChannel() {
    return this.outputChannel;
  }

  ensureConnected(reason: string) {
    return this.enqueueConfigure(reason, false);
  }

  recover(reason: string) {
    return this.enqueueConfigure(reason, true);
  }

  dispose() {
    this.isDisposed = true;
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.outputChannel.dispose();
  }

  private enqueueConfigure(reason: string, forceNewPort: boolean) {
    const run = async () => {
      if (this.isDisposed) {
        return undefined;
      }

      return this.configure(reason, forceNewPort);
    };

    this.pendingConfigure = this.pendingConfigure.then(run, run);
    return this.pendingConfigure;
  }

  private async configure(reason: string, forceNewPort: boolean) {
    const preferredPort =
      forceNewPort || !this.currentPort
        ? await getAvailablePort(this.defaultPort, forceNewPort ? this.currentPort : undefined)
        : this.currentPort;

    const connectedPort = await this.applyConfig(preferredPort, reason);
    if (connectedPort) {
      return connectedPort;
    }

    if (forceNewPort) {
      return undefined;
    }

    const fallbackPort = await getAvailablePort(this.defaultPort, preferredPort);
    if (fallbackPort === preferredPort) {
      return undefined;
    }

    return this.applyConfig(fallbackPort, `${reason} (fallback port)`);
  }

  private async applyConfig(port: number, reason: string) {
    const config: Partial<PluginConfig> = {
      port,
    };

    this.outputChannel.appendLine(`[connection] configure ${pluginId} on port ${port} (${reason})`);
    this.api.configurePlugin(pluginId, config);

    const healthy = await waitForHealthy(port);
    if (!healthy) {
      this.outputChannel.appendLine(`[connection] health check failed on port ${port}`);
      return undefined;
    }

    this.currentPort = port;
    return port;
  }
}

async function getAvailablePort(defaultPort: number, excludedPort?: number) {
  return getPort({
    port: buildPortCandidates(defaultPort, excludedPort),
  });
}

function buildPortCandidates(defaultPort: number, excludedPort?: number) {
  const candidates: number[] = [];

  for (let offset = 0; offset < 20; offset += 1) {
    const port = defaultPort + offset;
    if (port !== excludedPort) {
      candidates.push(port);
    }
  }

  return candidates;
}

async function waitForHealthy(port: number) {
  for (let attempt = 0; attempt < HealthRetryCount; attempt += 1) {
    try {
      const response = await axios.get<PluginHealthResponse>(`http://127.0.0.1:${port}/health`, {
        timeout: HealthCheckTimeoutMs,
      });

      if (isPluginHealthResponse(response.data, port)) {
        return true;
      }
    } catch {
      // noop
    }

    await delay(HealthRetryDelayMs);
  }

  return false;
}

function isPluginHealthResponse(input: PluginHealthResponse | undefined, port: number) {
  return (
    input?.kind === 'ts-viewer-health' &&
    typeof input.port === 'number' &&
    input.port === port &&
    typeof input.projectCount === 'number'
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
