import {
  PluginGetTypeRoutePath,
  PluginLoopbackHost,
  createErrorResponse,
  type GetTypeRequest,
  type GetTypeResponse,
} from '@ts-viewer/shared';
import axios from 'axios';
import * as vscode from 'vscode';
import type { PluginConnection } from './connection';

const RequestTimeoutMs = 1500;
const RecoverableErrorCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ERR_NETWORK']);

interface GetTypeOptions {
  cancellationToken?: vscode.CancellationToken;
}

export async function getType(
  document: vscode.TextDocument,
  position: vscode.Position,
  connection: PluginConnection,
  options: GetTypeOptions = {},
) {
  const offset = document.offsetAt(position);
  const req: GetTypeRequest = {
    fileName: document.fileName,
    position: offset,
  };

  const abortController = new AbortController();
  const cancellationSubscription = options.cancellationToken?.onCancellationRequested(() => {
    abortController.abort();
  });

  if (options.cancellationToken?.isCancellationRequested) {
    abortController.abort();
  }

  try {
    return await requestWithRecovery(req, connection, abortController.signal);
  } catch (error) {
    if (isCanceledError(error, abortController.signal)) {
      return undefined;
    }
    return createErrorResponse(error);
  } finally {
    cancellationSubscription?.dispose();
  }
}

async function requestWithRecovery(
  req: GetTypeRequest,
  connection: PluginConnection,
  signal: AbortSignal,
): Promise<GetTypeResponse | undefined> {
  const port = connection.getPort() ?? (await connection.ensureConnected('type request'));
  if (!port || signal.aborted) {
    return undefined;
  }

  try {
    return await requestTypeInfo(req, port, signal);
  } catch (error) {
    if (isCanceledError(error, signal)) {
      return undefined;
    }

    if (!shouldRecover(error)) {
      return createErrorResponse(error);
    }

    throwIfAborted(signal);

    const recoveredPort = await connection.recover(
      `get-type request failed: ${getAxiosErrorMessage(error)}`,
    );

    throwIfAborted(signal);

    if (!recoveredPort) {
      return createErrorResponse(error);
    }

    return await requestTypeInfo(req, recoveredPort, signal);
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

async function requestTypeInfo(request: GetTypeRequest, port: number, signal: AbortSignal) {
  const result = await axios.post<GetTypeResponse>(
    `http://${PluginLoopbackHost}:${port}${PluginGetTypeRoutePath}`,
    request,
    {
      timeout: RequestTimeoutMs,
      signal,
    },
  );
  return result.data;
}

function shouldRecover(error: unknown) {
  return axios.isAxiosError(error) && !!error.code && RecoverableErrorCodes.has(error.code);
}

function isCanceledError(error: unknown, signal: AbortSignal) {
  return signal.aborted || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED');
}

function getAxiosErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return `Request timed out after ${RequestTimeoutMs}ms`;
    }

    return error.message;
  }

  return String(error);
}
