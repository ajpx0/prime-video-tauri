const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async (configuration, packager) => {
  if (process.env.EVS_SIGN !== '1' || path.basename(configuration.path) !== `${packager.appInfo.productFilename}.exe`) return;
  execFileSync('evs-vmp', ['sign-pkg', path.dirname(configuration.path)], { stdio: 'inherit', env: { ...process.env, EVS_NO_ASK: '1' } });
};
