import {
  PluginHealthKind,
  PluginHealthRoutePath,
  PluginLoopbackHost,
  type PluginConfig,
  type PluginHealthResponse,
} from '@ts-viewer/shared';
import axios from 'axios';
import getPort from 'get-port';
import { pluginId, probeSelectors, typeScriptExtensionId } from './constants';
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
const ReuseHealthTtlMs = 5000;
const PortCandidateRange = 20;
const ProbeDebounceMs = 500;

export interface PluginConnection extends vscode.Disposable {
  getPort(): number | undefined;
  ensureConnected(reason: string): Promise<number | undefined>;
  recover(reason: string): Promise<number | undefined>;
  getOutputChannel(): vscode.OutputChannel;
}

export async function createPluginConnection(
  defaultPort: number,
  outputChannel: vscode.OutputChannel,
) {
  const extension = vscode.extensions.getExtension(typeScriptExtensionId);
  if (!extension) {
    outputChannel.appendLine(
      `[ts-viewer:connection] TypeScript extension (${typeScriptExtensionId}) not found`,
    );
    void vscode.window.showWarningMessage(
      '[TS Viewer] TypeScript language features extension is not available. TS Viewer requires it to function.',
    );
    return;
  }

  try {
    await extension.activate();
  } catch (error) {
    outputChannel.appendLine(
      `[ts-viewer:connection] TypeScript extension activation failed: ${String(error)}`,
    );
    return;
  }

  const extApi = extension.exports as Api | undefined;
  if (!extApi?.getAPI) {
    outputChannel.appendLine(
      '[ts-viewer:connection] TypeScript extension API is not available (no getAPI)',
    );
    void vscode.window.showWarningMessage(
      '[TS Viewer] Unable to access TypeScript extension API. Please try reloading the window.',
    );
    return;
  }

  const api = extApi.getAPI(0);
  if (!api) {
    outputChannel.appendLine(
      '[ts-viewer:connection] TypeScript extension API v0 returned undefined',
    );
    void vscode.window.showWarningMessage(
      '[TS Viewer] TypeScript extension API version is incompatible. Please update VS Code.',
    );
    return;
  }

  const connection = new PluginConnectionManager(api, defaultPort, outputChannel);
  return connection;
}

class PluginConnectionManager implements PluginConnection {
  private currentPort: number | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];
  private pendingConfigure: Promise<number | undefined> = Promise.resolve(undefined);
  private isDisposed = false;
  private lastHealthyPort: number | undefined;
  private lastHealthCheckAt = 0;
  private probeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly api: ApiV0,
    private readonly defaultPort: number,
    private readonly outputChannel: vscode.OutputChannel,
  ) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.ensureConnected('workspace folders changed');
      }),
    );
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        this.probeForSupportedDocument(document, 'supported document opened');
      }),
    );
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.probeForSupportedDocument(editor?.document, 'active editor changed');
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
    if (this.probeTimer !== undefined) {
      clearTimeout(this.probeTimer);
      this.probeTimer = undefined;
    }
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
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
    const currentPort = this.currentPort;
    if (!forceNewPort && currentPort) {
      const isHealthy = await this.isPortHealthy(currentPort, reason);
      if (isHealthy) {
        return currentPort;
      }
    }

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

    this.outputChannel.appendLine(
      `[ts-viewer:connection] configure ${pluginId} on port ${port} (${reason})`,
    );
    this.api.configurePlugin(pluginId, config);

    const healthy = await waitForHealthy(port, HealthRetryCount, this.outputChannel);
    if (!healthy) {
      this.outputChannel.appendLine(
        `[ts-viewer:connection] health check failed on port ${port} after ${HealthRetryCount} attempts`,
      );
      if (this.currentPort === port) {
        this.currentPort = undefined;
      }
      return undefined;
    }

    this.outputChannel.appendLine(`[ts-viewer:connection] connected on port ${port}`);
    this.currentPort = port;
    this.lastHealthyPort = port;
    this.lastHealthCheckAt = Date.now();
    return port;
  }

  private async isPortHealthy(port: number, reason: string) {
    const now = Date.now();
    if (this.lastHealthyPort === port && now - this.lastHealthCheckAt < ReuseHealthTtlMs) {
      return true;
    }

    const healthy = await waitForHealthy(port, 1, this.outputChannel);
    if (healthy) {
      this.lastHealthyPort = port;
      this.lastHealthCheckAt = now;
      return true;
    }

    this.outputChannel.appendLine(
      `[ts-viewer:connection] existing port ${port} is unhealthy (${reason})`,
    );
    if (this.currentPort === port) {
      this.currentPort = undefined;
    }
    return false;
  }

  private probeForSupportedDocument(document: vscode.TextDocument | undefined, reason: string) {
    if (!document || !probeSelectors.includes(document.languageId)) {
      return;
    }

    if (this.probeTimer !== undefined) {
      clearTimeout(this.probeTimer);
    }

    this.probeTimer = setTimeout(() => {
      this.probeTimer = undefined;
      void this.ensureConnected(reason);
    }, ProbeDebounceMs);
  }
}

async function getAvailablePort(defaultPort: number, excludedPort?: number) {
  return getPort({
    port: buildPortCandidates(defaultPort, excludedPort),
  });
}

function buildPortCandidates(defaultPort: number, excludedPort?: number) {
  const candidates: number[] = [];

  for (let offset = 0; offset < PortCandidateRange; offset += 1) {
    const port = defaultPort + offset;
    if (port !== excludedPort) {
      candidates.push(port);
    }
  }

  return candidates;
}

async function waitForHealthy(
  port: number,
  retryCount: number,
  outputChannel: vscode.OutputChannel,
) {
  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    try {
      const response = await axios.get<PluginHealthResponse>(
        `http://${PluginLoopbackHost}:${port}${PluginHealthRoutePath}`,
        {
          timeout: HealthCheckTimeoutMs,
        },
      );

      if (isPluginHealthResponse(response.data, port)) {
        return true;
      }

      if (retryCount > 1) {
        outputChannel.appendLine(
          `[ts-viewer:health] port ${port} attempt ${
            attempt + 1
          }/${retryCount}: unexpected response`,
        );
      }
    } catch (error) {
      if (retryCount > 1) {
        const code = axios.isAxiosError(error) ? error.code ?? 'UNKNOWN' : 'UNKNOWN';
        outputChannel.appendLine(
          `[ts-viewer:health] port ${port} attempt ${attempt + 1}/${retryCount}: ${code}`,
        );
      }
    }

    if (attempt + 1 < retryCount) {
      await delay(HealthRetryDelayMs);
    }
  }

  return false;
}

function isPluginHealthResponse(input: PluginHealthResponse | undefined, port: number) {
  if (!input) {
    return false;
  }

  return (
    input.kind === PluginHealthKind &&
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
