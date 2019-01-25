const fs = require('fs');
const {
    createClient
} = require('webdav');
const config = require('config');
const Email = require('email-templates');
const cheerio = require('cheerio');
const glob = require('glob');
const parseString = require('xml2js').parseString;
const { get, download } = require('./request');
const Configstore = require('configstore');
const mkdirp = require('mkdirp');
const pkg = require('./package.json');

const conf = new Configstore(pkg.name, { pushed: [] });
const users = Object.values(config.get('users'));

const fileWhitelist = ['.zip', '.capability', 'encrypted', '.client', 'data/'];

const downloadDirectoryRecursively = (path, username, password) => {
    const buildURL = (p) => `https://sync1.omnigroup.com/${username}/OmniFocus.ofocus/${p ? p : ''}`;

    return get(buildURL(path), username, password)
        .then(({
            body
        }) => {
            console.log('Done! Parsing and fetching zips...');

            const $ = cheerio.load(body);
            // console.log($('a', 'table').map((i, elem) => $(elem).attr('href')));
            // Search for a inside of table (yup it's backwards).
            const tasks = [asyncMkdirp('OmniFocus.ofocus')];
            $('a', 'table').each((i, elem) => {
                const link = $(elem).attr('href');

                let shouldDownload = false;
                let isDirectory = false;
                for (x in fileWhitelist) {
                    if (link.indexOf(fileWhitelist[x]) !== -1) {
                        shouldDownload = true;
                        continue;
                    }
                }

                if (shouldDownload) {
                    // Add Lazy method for requesting data to be called later.
                    // TODO: Need to download the "data/" sub-directory.
                    // TODO: Need to exclude html files, they aren't encrypted.
                    if (link[link.length - 1] === '/') {
                        tasks.push(asyncMkdirp(`OmniFocus.ofocus/${link}`));
                        tasks.push(downloadDirectoryRecursively(link, username, password));
                    } else {
                        const task = new Promise(resolve => {
                            console.log(`Downloading ${path + link}...`);
                            download(buildURL(link), username, password, `OmniFocus.ofocus/${path + link}`)
                              .then(resolve)
                              .catch(err => console.log);
                        });

                        tasks.push(task);
                    }
                }
            });

            return Promise.all(tasks);
        });
}

console.log("Downloading database...");
downloadDirectoryRecursively('', users[0].username, users[0].password)
    .catch(err => console.log)
    .then(() => {
        console.log("All done!");
    });


const mergeFiles = () => {
    glob("output/**/*.xml", {}, (er, files) => {
        const tasks = files.map(file => {
            return new Promise(resolve => {
                fs.readFile(file, (err, data) => {
                    if (err) return reject(err);
                    return resolve(data.toString());
                });
            });
        });
        return Promise.all(tasks)
            .then(results => {
                const tasks = [];
                const contexts = [];
                const relations = [];
                results.forEach(xml => {
                    parseString(xml, (err, result) => {
                        if (err || !result) return;
                        // Grab each task.
                        tasks.push(result.omnifocus.task);
                        // Grab tags.
                        contexts.push(result.omnifocus.context);
                        // Grab tag to task relationships.
                        relations.push(result.omnifocus['task-to-tag']);
                    });
                });

                // Grab tags that match our users.
                const filteredContexts = flattenDeep(contexts)
                    .filter(c => c) // Remove empty items;
                    .map(context => {
                        if (context.name) {
                            context.name = context.name[0];
                            return context;
                        }
                    })
                    .filter(c => c) // Remove empty items again!
                    .filter(context => context.name === 'Taryn');

                // TODO: Instead of grabbing first user, we need to do this for all.
                const tag = filteredContexts[0];

                // Find the tasks with the above tag.
                let filteredRelations = flattenDeep(relations)
                    .filter(c => c)
                    .map(relation => {
                        if (relation.context) {
                            return relation;
                        }
                    })
                    .filter(c => c) // Remove empty items again!
                    .filter(relation => relation.context[0].$.idref === tag.$.id);

                // Remove duplicates.
                // TODO: These aren't duplicates, they're transactions. So we might need to make this logic smarter.
                filteredRelations = filteredRelations.filter((relation, index, self) =>
                    index === self.findIndex((r) => (
                        r.$.id === relation.$.id
                    ))
                );


                // Now find the tasks referenced in the relations.
                let filteredTasks = flattenDeep(tasks)
                    .filter(c => c)
                    .filter(task => task.$.id === filteredRelations[0].task[0].$.idref);

                // TODO: Same as above, this logic is dumb.
                filteredTasks = filteredTasks.filter((task, index, self) =>
                    index === self.findIndex((r) => (
                        r.$.id === task.$.id
                    ))
                );

                const email = new Email({
                    message: {
                        // TODO: Make this configurable.
                        from: 'jacerox1234@gmail.com'
                    },
                    // Umcomment to send in development.
                    // send: true,
                    transport: config.get('transport'),
                });

                filteredTasks.forEach(task => {
                    email
                        .send({
                            template: 'oftask',
                            message: {
                                to: users[1].maildrop,
                            },
                            locals: {
                                name: 'Jason',
                                task: task.name[0],
                                details: {
                                    "Due Date": task.due['0'] !== '' ? task.due[0] : "none",
                                },
                            },
                        })
                        .then(console.log)
                        .catch(console.error);
                });
            })
    });
};

function flattenDeep(arr1) {
    return arr1.reduce((acc, val) => Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val), []);
}

// mergeFiles();

const asyncMkdirp = path => new Promise((resolve, reject) => {
    mkdirp(path, function (err) {
        if (err) reject(err);
        else resolve();
    });
});