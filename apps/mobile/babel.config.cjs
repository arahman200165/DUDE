// react-native-worklets Bundle Mode: worklet runtimes execute full bundled modules (npm and workspace imports), which is how
// heavy tool engines run off the React Native JS thread (src/kit/off-thread.ts). babel-preset-expo adds the worklets plugin
// automatically but without options, so it is disabled there and registered here with bundleMode.
/** @type {import('react-native-worklets/plugin').PluginOptions} */
const workletsPluginOptions = {
  bundleMode: true,
  // Import forwarding: imports from these packages inside a worklet are re-imported on the worker runtime (own module state)
  // instead of being captured from the React Native runtime. Prefix match on "<name>/".
  importForwarding: {
    moduleNames: ['@dude/tool-engine', '@dude/crypto', '@dude/shared-types', '@dude/domain'],
    relativePaths: ['src/tools', 'src/kit', 'src/engine-host'],
  },
};

// babel-preset-expo is a dependency of expo and is not hoisted in this workspace layout, so resolve it from expo.
const expoPreset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });

module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [[expoPreset, { worklets: false, reanimated: false }]],
    plugins: [['react-native-worklets/plugin', workletsPluginOptions]],
  };
};
