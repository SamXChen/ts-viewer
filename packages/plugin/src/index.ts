import { LanguageServiceMode, server } from 'typescript/lib/tsserverlibrary';

import { PluginConfig } from '@ts-viewer/shared';

import { startListen, restartListen, setCreatedInfo } from './service';

const factory: server.PluginModuleFactory = () => {
  return {
    create(info) {
      const logger = info.project.projectService.logger;

      if (info.project.projectService.serverMode !== LanguageServiceMode.Semantic) {
        logger.info('[TS-Viewer] skipping non-semantic server mode');
        return info.languageService;
      }

      try {
        logger.info('[TS-Viewer] plugin loaded');

        setCreatedInfo(info);

        if (typeof info.config.port === 'number') {
          void startListen(info.config.port);
        }
      } catch (error) {
        logger.info(`[TS-Viewer] plugin create failed: ${String(error)}`);
        return info.languageService;
      }

      return {
        ...info.languageService,
      };
    },
    onConfigurationChanged(config: Partial<PluginConfig>) {
      try {
        if (typeof config.port === 'number') {
          void restartListen(config.port);
        }
      } catch (error) {
        console.error('[TS-Viewer] onConfigurationChanged failed:', error);
      }
    },
  };
};

export = factory;
