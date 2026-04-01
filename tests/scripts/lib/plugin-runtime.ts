import path from 'node:path';
import { repoRoot } from './fixture-smoke';

export const pluginSourceRoot = path.join(repoRoot, 'packages', 'plugin', 'src');
export const pluginUtilsRoot = path.join(pluginSourceRoot, 'utils');
export const pluginVueRoot = path.join(pluginSourceRoot, 'vue');
export const serviceSourcePath = path.join(pluginSourceRoot, 'service.ts');
export const vueSourcePath = path.join(pluginVueRoot, 'index.ts');
export const pluginUtilitySourcePaths = [
  path.join(pluginUtilsRoot, 'expiring-cache.ts'),
  path.join(pluginUtilsRoot, 'path.ts'),
  path.join(pluginUtilsRoot, 'syntax.ts'),
  path.join(pluginUtilsRoot, 'type-format.ts'),
];
export const pluginVueSourcePaths = [
  path.join(pluginVueRoot, 'index.ts'),
  path.join(pluginVueRoot, 'script.ts'),
  path.join(pluginVueRoot, 'virtual-file.ts'),
];
