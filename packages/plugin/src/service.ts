import express from 'express';
import * as http from 'http';

import { server as tsServer, Node } from 'typescript/lib/tsserverlibrary';
import 'open-typescript';

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
      const program = info.languageService.getProgram();

      const typeChecker = program?.getTypeChecker();
      const sourceFile = program?.getSourceFile(req.body.fileName);

      const node = ts.getTokenAtPosition(sourceFile as ts.SourceFile, req.body.position);

      const type = typeChecker?.getTypeAtLocation(node as Node);
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
      logger.info(`[TS-Faker] Error: ${err as any}`);
      res.status(500).send('Internal Server Error');
    }
  });

  return app;
}
