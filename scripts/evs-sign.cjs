const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async (configuration) => {
  if (process.env.EVS_SIGN !== '1' || path.basename(configuration.path) !== 'prime-video-tauri.exe') return;
  execFileSync('evs-vmp', ['sign-pkg', path.dirname(configuration.path)], { stdio: 'inherit' });
};
