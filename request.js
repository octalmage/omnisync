const Curl = require('node-libcurl').Curl;
const fs = require('fs');

module.exports = {
  get: (url, username, password) => new Promise((resolve, reject) => {
    const ch = new Curl();

    ch.setOpt('URL', url);
    //or use an already defined constant
    ch.setOpt(Curl.option.CONNECTTIMEOUT, 60);
    ch.setOpt(Curl.option.FOLLOWLOCATION, true);


    ch.setOpt(Curl.option.HTTPAUTH, Curl.auth.DIGEST);
    // Uncomment to show more debug information.
    // ch.setOpt( Curl.option.VERBOSE, true );
    ch.setOpt(Curl.option.USERNAME, username);
    ch.setOpt(Curl.option.PASSWORD, password);

    ch.on('end', (statusCode, body, headers) => {
        ch.close();
        return resolve({ statusCode, body, headers, url });
    });

    ch.on('error', (err, curlErrCode) => {
        console.error('Err: ', err);
        console.error('Code: ', curlErrCode);
        ch.close();
        return reject(err, curlErrCode);
    });

    ch.perform();


    return;
  }),

  download: (url, username, password, destination) => new Promise((resolve, reject) => {
  const ch = new Curl();
  const fileOut = fs.openSync(destination, 'w+');

  ch.setOpt('URL', url);

  ch.setOpt(Curl.option.CONNECTTIMEOUT, 60);
  ch.setOpt(Curl.option.FOLLOWLOCATION, true);

  ch.setOpt(Curl.option.HTTPAUTH, Curl.auth.DIGEST);
  // Uncomment to show more debug information.
  // ch.setOpt( Curl.option.VERBOSE, true );

  ch.setOpt(Curl.option.USERNAME, username);
  ch.setOpt(Curl.option.PASSWORD, password);

  ch.setOpt(Curl.option.WRITEFUNCTION, (buff, nmemb, size) => {
    return fs.writeSync(fileOut, buff, 0, nmemb * size);
  });

  ch.on('end', (statusCode, body, headers) => {
      ch.close();
      fs.closeSync(fileOut);
      return resolve({ statusCode, body, headers, url });
  });

  ch.on('error', (err, curlErrCode) => {
      console.error('Err: ', err);
      console.error('Code: ', curlErrCode);
      ch.close();
      fs.closeSync(fileOut);
      return reject(err, curlErrCode);
  });

  ch.perform();


  return;
}),

}