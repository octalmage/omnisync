const Curl = require('node-libcurl').Curl;


module.exports = (url, username, password) => new Promise((resolve, reject) => {
    const ch = new Curl();

    ch.setOpt('URL', url);
    //or use an already defined constant
    ch.setOpt(Curl.option.CONNECTTIMEOUT, 60);
    ch.setOpt(Curl.option.FOLLOWLOCATION, true);

    ch.setOpt(Curl.option.HTTPAUTH, Curl.auth.DIGEST);
    // Uncomment to show more debug information.
    //curl.setOpt( Curl.option.VERBOSE, true );
    //keep in mind that if you use an invalid option, a TypeError exception will be thrown
    ch.setOpt(Curl.option.USERNAME, username);
    ch.setOpt(Curl.option.PASSWORD, password);


    ch.on('end', function (statusCode, body, headers) {
        //   console.info('Body: ', body);
        // fs.writeFile('output.zip', body, (err) => {
        //     if (err) throw err;
        //     console.log('The file has been saved!');
        //     this.close();
        // });
        this.close();
        return resolve({ statusCode, body, headers, url });
    });

    ch.on('error', function (err, curlErrCode) {
        console.error('Err: ', err);
        console.error('Code: ', curlErrCode);
        this.close();
        reject(err, curlErrCode);
    });

    ch.perform();


    return;
});