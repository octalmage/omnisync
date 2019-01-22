const { createClient } = require('webdav');
require('dotenv').config();

const directoryList = async () => {
    const client = createClient(
        `https://sync1.omnigroup.com/${process.env.USER}/`,
        {
            username: process.env.USER,
            password: process.env.PASS
        }
    );
    // TODO: Use libcurl here if needed to keep the script cross plaform:
    // TODO: https://www.npmjs.com/package/node-libcurl
    // curl --user '$USER:$PASS' 'https://sync1.omnigroup.com/$USER/' --anyauth
    // Get directory contents
    return await client.getDirectoryContents('/');
};


directoryList()
    .then(console.log)
    .catch(console.log);