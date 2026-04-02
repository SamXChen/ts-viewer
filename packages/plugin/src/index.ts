import { LanguageServiceMode, server } from 'typescript/lib/tsserverlibrary';

import { PluginConfig } from '@ts-viewer/shared';

import { startListen, restartListen, setCreatedInfo } from './service';

const factory: server.PluginModuleFactory = () => {
  return {
    create(info) {
      const logger = info.project.projectService.logger;

      if (info.project.projectService.serverMode !== LanguageServiceMode.Semantic) {
        logger.info('[ts-viewer] skipping non-semantic server mode');
        return info.languageService;
      }

      try {
        logger.info('[ts-viewer] plugin loaded');

        setCreatedInfo(info);

        if (typeof info.config.port === 'number') {
          startListen(info.config.port);
        }
      } catch (error) {
        logger.info(`[ts-viewer] plugin create failed: ${String(error)}`);
        return info.languageService;
      }

      return {
        ...info.languageService,
      };
    },
    onConfigurationChanged(config: Partial<PluginConfig>) {
      try {
        if (typeof config.port === 'number') {
          restartListen(config.port);
        }
      } catch (error) {
        // console.error used here because tsServer logger is not accessible in onConfigurationChanged
        console.error('[ts-viewer] onConfigurationChanged failed:', error);
      }
    },
  };
};

export = factory;
