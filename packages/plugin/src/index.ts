import { LanguageServiceMode, server } from 'typescript/lib/tsserverlibrary';

import { PluginConfig } from '@ts-faker/shared';

import { startListen } from './service';

const factory: server.PluginModuleFactory = () => {
  let currentInfo: server.PluginCreateInfo | undefined;

  return {
    create(info) {
      if (info.project.projectService.serverMode !== LanguageServiceMode.Semantic) {
        return info.languageService;
      }
      currentInfo = info;

      startListen({
        port: (info.config as PluginConfig).port,
        info: info,
      });

      return {
        ...info.languageService,
      };
    },
    onConfigurationChanged(config: Partial<PluginConfig>) {
      if (!currentInfo) {
        return;
      }
      startListen({
        port: config.port!,
        info: currentInfo,
      });
    },
  };
};

export = factory;
