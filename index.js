const fs = require('fs');
const {
    createClient
} = require('webdav');

const cheerio = require('cheerio');
const request = require('./request');
require('dotenv').config();

const buildURL = path => `https://sync1.omnigroup.com/${process.env.OF_USERNAME}/OmniFocus.ofocus/${path}`;

console.log("Downloading database!");
request(`https://sync1.omnigroup.com/${process.env.OF_USERNAME}/OmniFocus.ofocus/`)
.then(({ body }) => {
    const $ = cheerio.load(body);
    // Search for a inside of table (yup it's backwards).
    return $('a', 'table > tbody').map(function(i, elem) {
        const link = $(elem).attr('href');
        if (link.indexOf('.zip') !== -1) {
            const fullLink = buildURL(link);
            console.log(`Downloading: ${fullLink}`);
            return { path: link, p: request(fullLink) };
        }

      });
})
.then((files) => {
    files.forEach(({ path, p }) => {
        p.then((result) => {
            fs.writeFile(`.ofocus/${path}`, result);
        });
    });
    console.log("All done!");
})




// const directoryList = async () => {
//     const client = createClient(
//         `https://sync1.omnigroup.com/${process.env.OF_USERNAME}/`,
//         {
//             username: process.env.OF_USERNAME,
//             password: process.env.OF_PASSWORD,
//         }
//     );
//     // TODO: Use libcurl here if needed to keep the script cross plaform:
//     // TODO: https://www.npmjs.com/package/node-libcurl
//     // curl --user '$OF_USERNAME:$OF_PASSWORD' 'https://sync1.omnigroup.com/octalmage/OmniFocus.ofocus/00000000000000=akboxKaHKGb+kt96ngMmeha.zip' --anyauth
//     // Get directory contents
//     return await client.getDirectoryContents('/');
// };


// directoryList()
//     .then(console.log)
//     .catch(console.log);