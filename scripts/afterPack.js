const fs = require('fs');
const path = require('path');

// Fix Linux SUID sandbox issue by creating a wrapper script
// that passes --no-sandbox to the actual Electron binary
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;

  const appOutDir = context.appOutDir;

  // Remove chrome-sandbox to avoid SUID issues
  const sandboxPath = path.join(appOutDir, 'chrome-sandbox');
  if (fs.existsSync(sandboxPath)) {
    fs.unlinkSync(sandboxPath);
    console.log('Removed chrome-sandbox from Linux build');
  }

  // Find the actual executable
  const executableName = context.packager.executableName;
  const realBinary = path.join(appOutDir, executableName);

  if (fs.existsSync(realBinary)) {
    const renamedBinary = path.join(appOutDir, `${executableName}.bin`);
    fs.renameSync(realBinary, renamedBinary);

    // Wrapper uses readlink -f to resolve symlinks (e.g. /usr/bin/ezprofile -> /opt/EzProfile/ezprofile)
    const wrapperScript = `#!/bin/bash
REAL_PATH="$(readlink -f "$0")"
DIR="$(dirname "$REAL_PATH")"
exec "$DIR/${executableName}.bin" --no-sandbox "$@"
`;
    fs.writeFileSync(realBinary, wrapperScript, { mode: 0o755 });
    console.log(`Created wrapper: ${executableName} -> ${executableName}.bin --no-sandbox`);
  } else {
    console.warn(`WARNING: Could not find executable at ${realBinary}`);
  }
};
