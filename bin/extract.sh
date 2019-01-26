#!/bin/bash
find $1 -name '*.zip' -exec sh -c 'unzip -d "${1%.*}" "$1"' _ {} \;
