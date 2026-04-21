#!/bin/bash

# Link the binary to /usr/bin so users can run "ezprofile" from terminal
# The actual executable is "EzProfile" (PascalCase) from electron-builder
BINARY_PATH="/opt/EzProfile/EzProfile"
if [ -f "$BINARY_PATH" ]; then
  update-alternatives --install /usr/bin/ezprofile ezprofile "$BINARY_PATH" 100
fi
