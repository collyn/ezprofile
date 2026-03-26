#!/bin/bash

# Remove the alternatives link when uninstalling
update-alternatives --remove ezprofile /opt/EzProfile/ezprofile 2>/dev/null || true
