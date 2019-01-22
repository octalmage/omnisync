#!/bin/zsh
source .env
curl --user "$OF_USERNAME:$OF_PASSWORD" "https://sync1.omnigroup.com/$OF_USERNAME/OmniFocus.ofocus/" --anyauth