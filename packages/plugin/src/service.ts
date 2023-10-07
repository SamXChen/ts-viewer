import express from 'express';
import * as http from 'http';

import { server as tsServer, Node } from 'typescript/lib/tsserverlibrary';

import * as ts from 'typescript';

const createdInfoMap = new Map<string, tsServer.PluginCreateInfo>();

export function setCreatedInfo(info: tsServer.PluginCreateInfo) {
  const currentDir = info.project.getCurrentDirectory();
  info.project.projectService.logger.info(
    `[TS-Viewer][Create-Info][Current-Directory] ${currentDir}`,
  );
  createdInfoMap.set(currentDir, info);
}

function getMatchedInfo(fileName: string) {
  let result: tsServer.PluginCreateInfo | undefined;
  let lastMatchedLength = 0;

  for (const [key, value] of createdInfoMap.entries()) {
    if (fileName.startsWith(key) && key.length > lastMatchedLength) {
      result = value;
      lastMatchedLength = key.length;
    }
  }
  if (!result) {
    throw new Error('info not found');
  }
  return result;
}

let server: http.Server | undefined;

export function startListen(port: number) {
  if (server) {
    return;
  }
  server = createApp().listen(port, () => {
    console.log(`[TS-Viewer] Listening on port ${port}`);
  });
  return server;
}

export function restartListen(port: number) {
  if (server) {
    server.close();
    server = undefined;
  }
  startListen(port);
}

function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/get-type', (req, res) => {
    try {
      const info = getMatchedInfo(req.body.fileName);

      const logger = info.project.projectService.logger;

      logger.info(`[TS-Viewer][File-Name] ${req.body.fileName}, ${req.body.position}`);

      const program = info.languageService.getProgram();

      const typeChecker = program?.getTypeChecker();

      const sourceFile = program?.getSourceFile(req.body.fileName);

      const currentDirectory = program?.getCurrentDirectory();
      logger.info(`[TS-Viewer][Current-Directory] ${currentDirectory}`);

      if (!sourceFile) {
        throw new Error('sourceFile not found');
      }
      logger.info(`[TS-Viewer][Source-File] ${sourceFile.fileName}`);

      const node = findNode(sourceFile.getChildren(), req.body.position);
      if (!node) {
        throw new Error('node not found');
      }
      logger.info(`[TS-Viewer][Node] ${node.getText()}`);

      const type = typeChecker?.getTypeAtLocation(node);
      const typeInfoString = typeChecker?.typeToString(
        type!,
        undefined,
        ts.TypeFormatFlags.NoTruncation,
      );
      logger.info(`[TS-Viewer][Type-Info-String] ${typeInfoString}`);

      res.status(200).send(
        JSON.stringify({
          type: 'success',
          data: typeInfoString,
        }),
      );
    } catch (err) {
      console.error(err);
      res.status(200).send(
        JSON.stringify({
          type: 'error',
          data: err,
        }),
      );
    }
  });

  return app;
}

function findNode(nodeList: Node[], position: number) {
  let result: Node | undefined;
  for (const node of nodeList) {
    if (node.pos > position) {
      continue;
    }
    if (node.end < position) {
      continue;
    }
    const children = node.getChildren();
    if (children.length === 0) {
      result = node;
      break;
    }
    const childResult = findNode(node.getChildren(), position);
    if (childResult) {
      result = childResult;
      break;
    }
  }
  return result;
}
