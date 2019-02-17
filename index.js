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
const merge = require('deepmerge');
const dayjs = require('dayjs');
const rmdir = require('rimraf');
const conf = new Configstore(pkg.name, { pushed: [] });
const users = Object.values(config.get('users'));

const fileWhitelist = [/.zip$/, /.capability/, /encrypted/, /.client$/, /data\//];
const outDir = '/tmp/';
const downloadDirectoryRecursively = (path, username, password) => {
    const buildURL = (p) => `https://sync1.omnigroup.com/${username}/OmniFocus.ofocus/${p ? p : ''}`;

    return get(buildURL(path), username, password)
        .then(({
            body
        }) => {
            console.log('Done! Parsing and fetching zips...');

            const $ = cheerio.load(body);
            // console.log($('a', 'table').map((i, elem) => $(elem).attr('href')));
            // Search for an "a" inside of table (yup it's backwards).
            const tasks = [asyncMkdirp(outDir + 'OmniFocus.ofocus')];
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
                        tasks.push(asyncMkdirp(`${outDir}OmniFocus.ofocus/${link}`));
                        tasks.push(downloadDirectoryRecursively(link, username, password));
                    } else {
                        const task = new Promise(resolve => {
                            console.log(`Downloading ${path + link}...`);
                            // TODO: Need to make the output dir configurable.
                            download(buildURL(link), username, password, `${outDir}OmniFocus.ofocus/${path + link}`)
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
        const outPath = `${outDir}${Date.now()}.OmniFocus.ofocus`;
        // return '1548549935175.OmniFocus.ofocus';
        return decryptOmniFocusDatabase(outDir + 'OmniFocus.ofocus', outPath, users[0].password)
        .then(() => outPath);
    })
    .then((outPath) => {
        // return outPath;
        return unzipRecursivelyInPlace(outPath)
        .then((output) => console.log(output))
        .then(() => outPath);
    })
    .then((outPath) => mergeFiles(outPath))
    .then(() => rmRecursively(outPath)
    		.then(() => rmRecursively(outDir + 'OmniFocus.ofocus'))
    )
    .then(() => console.log('All done!'))
    .catch(console.err);

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
                let contexts = [];
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

                contexts = flattenDeep(contexts);

                // Grab tags that match our users.
                let filteredParentContexts = findTasksWithValueForKey(contexts, 'name', 'People');
                filteredParentContexts = applyUpdates(filteredParentContexts, c => c.$.id);

                if (filteredParentContexts.length > 1) {
                    console.log('WARNING: Extra parent tag found.');
                    console.log(filteredParentContexts);
                }

                const parentContext = filteredParentContexts[0];
                const filteredContexts = contexts.filter(
                    context => {
                        if (
                            context &&
                            typeof context.context !== 'undefined' &&
                            typeof context.context[0] === 'object'
                        ) {
                            if (context.context[0].$.idref === parentContext.$.id) {
                                return true;
                            }
                            return false;
                        }
                       return false;
                    }
                );

                // TODO: Instead of grabbing first user, we need to do this for users that have maildrop addresses.
                const tag = findTasksWithValueForKey(filteredContexts, 'name', 'Taryn')[0];

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

                // TODO: Do we need to applyTransactions here?

                // Now find the tasks referenced in the relations.
                let filteredTasks = flattenDeep(tasks)
                    .filter(c => c)
                    // TODO: Double check this logic.
                    // Filter out completed tasks.
                    .filter(t => typeof t.completed !== 'undefined')
                    .filter(t => t.completed['0'] === '')
                    .filter(task => filteredRelations.map(t => t.task[0].$.idref).indexOf(task.$.id) !== -1);

                const email = new Email({
                    message: {
                        // TODO: Make this configurable.
                        from: config.get('email').fromAddress
                    },
                    // Umcomment to send in development.
                    // send: true,
                    transport: config.get('email').transport,
                });

                const finalTasks = applyUpdates(filteredTasks, t => t.$.id);
                finalTasks.forEach(task => {
                    // Store this task in our database if it's not in there already.
                    const taskId = task.$.id;
                    const pushed = conf.get('pushed');
                    console.log(`Found task: ${task.name} (${task.$.id})`);

                    // Already emailed, don't email again!
                    if (pushed.indexOf(taskId) !== -1) {
                        console.log('↳ Already synced, skipping');
                        return;
                    }

                    console.log("↳ Email sent!");

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
                                    // TODO Format these dates.
                                    "Added": formatDate(gets(task, 'added')),
                                    "Due Date": formatDate(gets(task, 'due')),
                                    "Notes": gets(task, 'note'),
                                    "Estimated Duration": gets(task, 'estimated-minutes'),
                                    // TODO: Add additional details like tags.
                                },
                            },
                        })
                        .then(results => {
                          // Save task ID to pushed table.
                          pushed.push(task.$.id);
                          conf.set({ pushed });
                        })
                        .catch(console.error);
                });
            })
    });

    return new Promise(handler);
};

const formatDate = input => dayjs(input).format('M/DD/YYYY h:mma');

// In OmniFocus everything is an array, so we have to use this helper to extract single values.
const gets = (task, key, defaultValue = 'none') => (
  (task[key]['0'] !== '') ? task[key][0] : defaultValue
);

const findTasksWithValueForKey = (tasks, key, value) => tasks
    .filter(c => c) // Remove empty items;
    .map(context => {
        if (context[key]) {
            return context;
        }
    })
    .filter(c => c) // Remove empty items again!
    .filter(context => context[key][0] === value);


const overwriteMerge = (destinationArray, sourceArray, options) => sourceArray;
const applyUpdates = (tasks, getID) => {
    const isTransaction = task => typeof task.$.op !== 'undefined';

    // Sort tasks so transactions are at the bottom.
    tasks.sort((a, b) => {
        if (isTransaction(a) && isTransaction(b)) {
            return 0;
        } else if (isTransaction(a) && !isTransaction(b)) {
            return 1
        } else {
            return -1;
        }
    });

    const taskTable = {};
    tasks.forEach(task => {
        const id = getID(task);
        if (typeof taskTable[id] === 'undefined' && typeof task.$.op === 'undefined') {
            taskTable[id] = task;
            return;
        }

        // Skipping non-transactions.
        if (typeof task.$.op === 'undefined') {
            return;
        }

        /**
         * Format:
         *   { '$': { id: 'ijrr10Cv7N5', op: 'update' },
         *   added: [ '2018-12-27T18:02:52.189Z' ],
         *   modified: [ '2019-01-25T13:11:23.086Z' ],
         *   due: [ '2019-01-26T23:00:00.000Z' ] }
         */
        const currentTask = taskTable[id];
        const transactionTask = update(task, { $unset: ['$', 'added'] });
        // Apply the transaction.
        taskTable[id] = merge(currentTask, transactionTask, { arrayMerge: overwriteMerge });
    });

    return Object.values(taskTable);
};

function flattenDeep(arr1) {
    return arr1.reduce((acc, val) => Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val), []);
}

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

          PythonShell.run('bin/decrypt/decrypt.py', options, (err, results) => {
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

const rmRecursively = (path) => {
	return new Promise((resolve) => {
			rmdir(path, resolve);
	});	
};
