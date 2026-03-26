#!/bin/bash

# Link the binary to /usr/bin so users can run "ezprofile" from terminal
BINARY_PATH="/opt/EzProfile/ezprofile"
if [ -f "$BINARY_PATH" ]; then
  update-alternatives --install /usr/bin/ezprofile ezprofile "$BINARY_PATH" 100
fi
