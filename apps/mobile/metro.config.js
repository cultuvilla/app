const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(workspaceRoot, 'packages'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// With hierarchical lookup off, every bare import resolves to the hoisted copy,
// not the version its importer declared. Expo's HMR client needs the
// pretty-format 29 it depends on; jest 30 hoists pretty-format 30, whose ESM
// entry has no nested default, and the app then dies at boot with
// "[runtime not ready] Cannot read property 'default' of undefined".
const expoDir = path.dirname(require.resolve('expo/package.json', { paths: [projectRoot] }));
const expoPrettyFormat = path.dirname(
  require.resolve('pretty-format/package.json', { paths: [expoDir] }),
);
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'pretty-format') {
    return context.resolveRequest(context, expoPrettyFormat, platform);
  }
  return (upstreamResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
