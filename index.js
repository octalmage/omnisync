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
const { PythonShell } = require('python-shell')
const exec = require('child_process').exec;

const update = require('immutability-helper').default;

const conf = new Configstore(pkg.name, { pushed: [] });
const users = Object.values(config.get('users'));

const fileWhitelist = [/.zip$/, /.capability/, /encrypted/, /.client$/, /data\//];

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
                    if (fileWhitelist[x].test(link)) {
                        shouldDownload = true;
                        continue;
                    }
                }

                if (shouldDownload) {
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
// Promise.resolve()
    .then(() => {
        const outPath = `${Date.now()}.OmniFocus.ofocus`;
        // return '1548392924284.OmniFocus.ofocus';
        return decryptOmniFocusDatabase('OmniFocus.ofocus', outPath, users[0].password)
        .then(() => outPath);
    })
    .then((outPath) => {
        // return outPath;
        return unzipRecursivelyInPlace(outPath)
        .then((output) => console.log(output))
        .then(() => outPath);
    })
    .then((outPath) => mergeFiles(outPath))
    .then(() => {
        console.log("All done!");
    })
    .catch(console.err)


const mergeFiles = (path) => {
    const handler = (resolve, reject) => glob(`${path}/**/*.xml`, {}, (er, files) => {
        const tasks = files.map(file => {
            return new Promise((s, f) => {
                fs.readFile(file, (err, data) => {
                    if (err) return f(err);
                    return s(data.toString());
                });
            });

        });
        return Promise.all(tasks)
            .then(results => {
                if (typeof results[0] === 'undefined') {
                    return console.error("Error reading xml files.");
                }
                const tasks = [];
                const contexts = [];
                const relations = [];
                results.forEach(xml => {
                    parseString(xml, (err, result) => {
                        if (err || !result) return;
                        // Grab each task.
                        // console.log(result);
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
        
                // filteredRelations = filteredRelations.filter((relation, index, self) =>
                //     index === self.findIndex((r) => (
                //         r.$.id === relation.$.id
                //     ))
                // );


                // Now find the tasks referenced in the relations.
                let filteredTasks = flattenDeep(tasks)
                    .filter(c => c)
                    .filter(task => filteredRelations.map(t => t.task[0].$.idref).indexOf(task.$.id) !== -1);
      
                // TODO: Same as above, this logic is dumb.
                // filteredTasks = filteredTasks.filter((task, index, self) =>
                //     index === self.findIndex((r) => (
                //         r.$.id === task.$.id
                //     ))
                // );
                
                // Apply transactions.
                const taskTable = {};
                filteredTasks.forEach(task => {
                    if (typeof taskTable[task.$.id] === 'undefined') {
                        taskTable[task.$.id] = task;
                        return;
                    } 
                    /**
                     * Format: 
                     *   { '$': { id: 'ijrr10Cv7N5', op: 'update' },
                     *   added: [ '2018-12-27T18:02:52.189Z' ],
                     *   modified: [ '2019-01-25T13:11:23.086Z' ],
                     *   due: [ '2019-01-26T23:00:00.000Z' ] }
                     */
                    const currentTask = taskTable[task.$.id];
                    const transactionTask = update(currentTask, { $unset: ['$', 'added'] });

                    // Apply the transaction.
                    taskTable[task.$.id] = update(currentTask, { $merge: transactionTask });
                });

                const email = new Email({
                    message: {
                        // TODO: Make this configurable.
                        from: 'jacerox1234@gmail.com'
                    },
                    // Umcomment to send in development.
                    // send: true,
                    transport: config.get('transport'),
                });

                Object.values(taskTable).forEach(task => {
                    // Store this task in our database if it's not in there already.
                    const taskId = task.$.id;
                    const pushed = conf.get('pushed');
                    console.log(`Found task: ${task.name}`);

                    // Already emailed, don't email again!
                    if (pushed.indexOf(taskId) !== -1) {
                        console.log('Already synced, skipping');
                        return;
                    }

                    pushed.push(task.$.id);
                    conf.set({ pushed });

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

    return new Promise(handler);
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

const decryptOmniFocusDatabase = (inputPath, outputPath, passphrase) => {
    return new Promise((resolve, reject) => {
        let options = {
            args: ['-p', passphrase, '-o', outputPath, inputPath]
          };
           
          PythonShell.run('bin/decrypt.py', options, (err, results) => {
            // if (err) console.log(err);
            return resolve(results);
          });
    });
};

const unzipRecursivelyInPlace = (path) => {
    return new Promise((resolve, reject) => {
        exec(`./bin/extract.sh ${path}/`,
        (err, stdout, stderr) => {
            if (err) reject(err);
            resolve(stdout)
        });
    });
};