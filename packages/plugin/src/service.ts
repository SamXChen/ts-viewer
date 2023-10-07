import express from 'express';
import * as http from 'http';

import { server as tsServer, Node } from 'typescript/lib/tsserverlibrary';

import * as ts from 'typescript';

let server: http.Server | undefined;

export function startListen(options: { port: number; info: tsServer.PluginCreateInfo }) {
  const { info, port } = options;
  const { logger } = info.project.projectService;

  if (server) {
    server.close();
    server = undefined;
  }

  server = createApp({ info }).listen(port, () => {
    logger.info(`[TS-Faker] Listening on port ${port}`);
  });

  return server;
}

function createApp(options: { info: tsServer.PluginCreateInfo }) {
  const { info } = options;
  const logger = info.project.projectService.logger;

  const app = express();
  app.use(express.json());

  app.post('/get-type', (req, res) => {
    try {
      logger.info(`[TS-Faker][File-Name] ${req.body.fileName}, ${req.body.position}`);

      const program = info.languageService.getProgram();

      const typeChecker = program?.getTypeChecker();
      // @FIXME: getSourceFile sometimes return undefined
      const sourceFile = program?.getSourceFile(req.body.fileName);

      const currentDirectory = program?.getCurrentDirectory();
      logger.info(`[TS-Faker][Current-Directory] ${currentDirectory}`);

      if (!sourceFile) {
        throw new Error('sourceFile not found');
      }
      logger.info(`[TS-Faker][Source-File] ${sourceFile.fileName}`);

      const node = findNode(sourceFile.getChildren(), req.body.position);
      if (!node) {
        throw new Error('node not found');
      }
      logger.info(`[TS-Faker][Node] ${node.getText()}`);

      const type = typeChecker?.getTypeAtLocation(node);
      const typeInfoString = typeChecker?.typeToString(
        type!,
        undefined,
        ts.TypeFormatFlags.NoTruncation,
      );
      logger.info(`[TS-Faker][Type-Info-String] ${typeInfoString}`);

      res.status(200).send(
        JSON.stringify({
          type: 'success',
          data: typeInfoString,
        }),
      );
    } catch (err) {
      logger.info(`[TS-Faker] Error: ${err as any}, ${(err as any).stack}}`);
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
