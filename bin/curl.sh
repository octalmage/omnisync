#!/bin/bash
source .env
curl --user "$OF_USERNAME:$OF_PASSWORD" "https://sync1.omnigroup.com/$OF_USERNAME/OmniFocus.ofocus/" --anyauth

# TODO: This worked to download everything:
echo wget -r -nH -np --cut-dirs=1 --no-check-certificate -U Mozilla --user=$OF_USERNAME --password=$OF_PASSWORD https://sync1.omnigroup.com/$OF_USERNAME/OmniFocus.ofocus/