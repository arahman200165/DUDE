const { withGradleProperties } = require('expo/config-plugins');

module.exports = config => withGradleProperties(config, mod => {
  const property = mod.modResults.find(item => item.type === 'property' && item.key === 'hermesEnabled');
  if (property) property.value = 'true';
  else mod.modResults.push({ type: 'property', key: 'hermesEnabled', value: 'true' });
  return mod;
});
