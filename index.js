const fs = require('fs');
const {
    createClient
} = require('webdav');

const cheerio = require('cheerio');
const request = require('./request');
require('dotenv').config();

const buildURL = path => `https://sync1.omnigroup.com/${process.env.OF_USERNAME}/OmniFocus.ofocus/${path}`;

console.log("Downloading database!");
request(buildURL())
    .then(({
        body
    }) => {
        console.log('Done! Parsing and fetching zips...');

        const $ = cheerio.load(body);
        // console.log($('a', 'table').map((i, elem) => $(elem).attr('href')));
        // Search for a inside of table (yup it's backwards).
        const tasks = [];
        $('a', 'table').each((i, elem) => {
            const link = $(elem).attr('href');
            // Add Lazy method for requesting data to be called later.
            // TODO: Need to download the "data/" sub-directory. 
            // TODO: Need to exclude html files, they aren't encrypted.
                const task = new Promise(resolve => {
                    console.log(`Downloading ${link}...`);
                    request(buildURL(link)).then(({ body }) => {
                        fs.writeFile(`OmniFocus.ofocus/${link}`, body, resolve);
                    }).catch(err => console.log);
                });
                tasks.push(task);
        });

        return Promise.all(tasks)
        .catch(err => console.log)
            .then(() => {
                console.log("All done!");
            });

    });
