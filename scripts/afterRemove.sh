#!/bin/bash

# Remove the alternatives link when uninstalling
update-alternatives --remove ezprofile /opt/EzProfile/EzProfile 2>/dev/null || true
