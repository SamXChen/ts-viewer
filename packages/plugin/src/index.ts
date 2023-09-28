import { LanguageServiceMode, server } from 'typescript/lib/tsserverlibrary';
import 'open-typescript';

import { GetInlayHintsRequest, GetInlayHintsResponse, PluginConfig } from '@ts-faker/shared';

import express from 'express';
import * as http from 'http';

const factory: server.PluginModuleFactory = () => {
  let server: http.Server | undefined;
  let start: ((port: number) => void) | undefined;

  return {
    create(info) {
      if (info.project.projectService.serverMode !== LanguageServiceMode.Semantic) {
        return info.languageService;
      }

      const config = info.config as Partial<PluginConfig> | undefined;

      const app = express();
      app.use(express.json());

      const originGetInlayHints = info.languageService.provideInlayHints.bind(info.languageService);

      const getInlayHintsWorker = (req: GetInlayHintsRequest): GetInlayHintsResponse => {
        return {
          hints: originGetInlayHints(req.fileName, req.span, req.preference),
        };
      };
      app.post('/inlay-hints', (req, res) => {
        try {
          info.project.projectService.logger.info(`[TS-Faker][inlay-hints] ${req.body.fileName}]`);
          const response = getInlayHintsWorker(req.body);
          res.json(response);
        } catch {
          res.status(500).send('Internal Server Error');
        }
      });

      start = (port: number) => {
        server?.close();
        server = app.listen(port, () => {
          info.project.projectService.logger.info(`[TS-Faker] Listening on port ${port}`);
        });
      };

      if (config?.port) {
        start(config.port);
      }

      return {
        ...info.languageService,
        provideInlayHints(...args) {
          if (server) {
            return [];
          }
          return originGetInlayHints(...args);
        },
      };
    },
    onConfigurationChanged(config: Partial<PluginConfig>) {
      if (start && config.port) {
        start(config.port);
      }
    },
  };
};

export = factory;
