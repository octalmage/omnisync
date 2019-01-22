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
    .then(({
        body
    }) => {
        console.log('Done! Parsing and fetching zips...');

        const $ = cheerio.load(body);
        // Search for a inside of table (yup it's backwards).
        return $('a', 'table > tbody').map((i, elem) => {
                const link = $(elem).attr('href');
                // Add Lazy method for requesting data to be called later.

                return () => new Promise(resolve => {
                    console.log(`Downloading ${link}...`);
                    request(buildURL(link)).then(result => {
                        fs.writeFile(`.ofocus/${link}`, result, resolve);
                    }).catch(err => console.log);
                });
            })
            .reduce((promiseChain, currentTask) => {
                console.log(promiseChain);
                return promiseChain.then(currentTask)
            }, Promise.resolve())
            .catch(err => console.log)
            .then(() => {
                console.log("All done!");
            });

    });


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