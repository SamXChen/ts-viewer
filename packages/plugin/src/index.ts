import { LanguageServiceMode, server } from 'typescript/lib/tsserverlibrary';

import { PluginConfig } from '@ts-viewer/shared';

import { startListen, restartListen, setCreatedInfo } from './service';

const factory: server.PluginModuleFactory = () => {
  return {
    create(info) {
      if (info.project.projectService.serverMode !== LanguageServiceMode.Semantic) {
        return info.languageService;
      }

      setCreatedInfo(info);

      if (typeof info.config.port === 'number') {
        void startListen(info.config.port);
      }

      return {
        ...info.languageService,
      };
    },
    onConfigurationChanged(config: Partial<PluginConfig>) {
      if (typeof config.port === 'number') {
        void restartListen(config.port);
      }
    },
  };
};

export = factory;
