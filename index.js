const fs = require('fs');
const {
    createClient
} = require('webdav');
const config = require('config');
const Email = require('email-templates');


const cheerio = require('cheerio');
const glob = require('glob');
const parseString = require('xml2js').parseString;
const request = require('./request');
const Configstore = require('configstore');
const pkg = require('./package.json');

const conf = new Configstore(pkg.name, { pushed: [] });
const users = Object.values(config.get('users'));

const buildURL = path => `https://sync1.omnigroup.com/${users[0].username}/OmniFocus.ofocus/${path}`;

console.log("Downloading database!");

// request(buildURL(), users[0].username, users[0].password)
//     .then(({
//         body
//     }) => {
//         console.log('Done! Parsing and fetching zips...');

//         const $ = cheerio.load(body);
//         // console.log($('a', 'table').map((i, elem) => $(elem).attr('href')));
//         // Search for a inside of table (yup it's backwards).
//         const tasks = [];
//         $('a', 'table').each((i, elem) => {
//             const link = $(elem).attr('href');
//             // Add Lazy method for requesting data to be called later.
//             // TODO: Need to download the "data/" sub-directory. 
//             // TODO: Need to exclude html files, they aren't encrypted.
//                 const task = new Promise(resolve => {
//                     console.log(`Downloading ${link}...`);
//                     request(buildURL(link)).then(({ body }) => {
//                         fs.writeFile(`OmniFocus.ofocus/${link}`, body, resolve);
//                     }).catch(err => console.log);
//                 });
//                 tasks.push(task);
//         });

//         return Promise.all(tasks)
//         .catch(err => console.log)
//             .then(() => {
//                 console.log("All done!");
//             });

//     });

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
                        tasks.push(result.omnifocus.task);
                        contexts.push(result.omnifocus.context);
                        relations.push(result.omnifocus['task-to-tag']);
                    });
                });
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

                const tag = filteredContexts[0];


                let filteredRelations = flattenDeep(relations)
                    .filter(c => c)
                    .map(relation => {
                        if (relation.context) {
                            return relation;
                        }
                    })
                    .filter(c => c) // Remove empty items again!
                    .filter(relation => relation.context[0].$.idref === tag.$.id);

                filteredRelations = filteredRelations.filter((relation, index, self) =>
                    index === self.findIndex((r) => (
                        r.$.id === relation.$.id
                    ))
                );

                filteredRelations.map(relation => {
                    console.log(relation.task[0].$.idref);
                });

                // .forEach(relation => console.log(relation));
                let filteredTasks = flattenDeep(tasks)
                    .filter(c => c)
                    .filter(task => task.$.id === filteredRelations[0].task[0].$.idref);

                filteredTasks = filteredTasks.filter((task, index, self) =>
                    index === self.findIndex((r) => (
                        r.$.id === task.$.id
                    ))
                );

                console.log(filteredTasks);

                const email = new Email({
                    message: {
                        // TODO: Make this configurable.
                        from: 'jacerox1234@gmail.com'
                    },
                    // TODO: Make this actually send.
                    // Umcomment to send.
                    send: true,
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

mergeFiles();