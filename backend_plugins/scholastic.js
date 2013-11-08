/*jshint node:true */
/*
    Scholastic specific extension
 */

var Q = require("q"),
    QFS = require("q-io/fs"),
    PATH = require("path"),
    HTTP = require("http"),
    HTTPS = require("https"),
    child_process = require('child_process'),
    crypto = require('crypto');


var guard = function(isbn) {
    return function (path) {
        var fileName = PATH.basename(path),
            expr = new RegExp("[\b-_]*(covers?|" + isbn + ")[\b-_]*", "i"),
            matches = fileName.match(expr);

        if (matches) {
            if (fileName.indexOf(isbn) !== -1) {
                var ext = PATH.extname(fileName).toLowerCase();
                return (ext === ".jpg" || ext === ".jpeg");
            }
            return false;
        } else {
            return false;
        }
    };
};


var pathFromURL = function(path) {
    var protocols = ["file://localhost/", "fs://localhost/"];

    path = decodeURI(path);

    protocols.some(function(protocol) {
        if (path.indexOf(protocol) === 0) {
            path = path.substring(protocol.length - 1);
            return true;
        }

        return false;
    });

    return path;
};

/*
    code from http://en.wikipedia.org/wiki/International_Standard_Book_Number
 */
function isValidISBN13(ISBNumber) {
    var check, i;

    ISBNumber = ISBNumber.replace(/[-\s]/g,'');

    check = 0;
    for (i = 0; i < 13; i += 2) {
        check += +ISBNumber[i];
    }
    for (i = 1; i < 12; i += 2){
        check += 3 * +ISBNumber[i];
    }
    return check % 10 === 0;
}

exports.getISBNFromFile = function (filePath) {
    var values = PATH.basename(filePath, ".pdf").replace(/[-\s]/g,'').match(/[0-9]*/),
        isbn = null;

    values.some(function(value) {
        if (value.length === 13) {
            // check if this is a valid ISBN-13
            if (isValidISBN13(value)) {
                isbn = value;
                return true;
            }
        }

        return false;
    });

    return isbn;
};

exports.setupCoverImage = function(item) {
    var filePath = pathFromURL(item.url),
        isbn,
        root = PATH.dirname(filePath);

    item.isbn = item.isbn || exports.getISBNFromFile(filePath);
    isbn = item.isbn;

    return QFS.listTree(root, guard(isbn)).then(function (paths) {
        if (paths && paths.length) {
            // Copy the cover file
            var destPath = PATH.join(pathFromURL(item.destination), "OEBPS", "assets", "cover.jpeg"),
                destURL = (item.destination + "/OEBPS/assets/cover.jpeg").replace(/ /g, "%20");
            return QFS.copy(paths[0], destPath).then(function() {
                return global.sendCommandToParentProcess("getImageInfo", {url: destURL}, true).then(function(info) {
                    var width = info.width,
                        height = info.height,
                        ratio = 1024 / Math.max(width, height);

                    if (ratio < 1) {
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                        return global.sendCommandToParentProcess("scaleImage", {sourceURL: destURL, destinationURL: destURL, size: {width: width, height: height}, quality: 0.6}, true);
                    }

                    return {url: item.destination + "/OEBPS/assets/cover.jpeg"};
                });
            });
        }
    });
};

exports.fetchData = function(options, secure) {
    var deferred = Q.defer(),
        http = (secure === true) ? HTTPS : HTTP;

    var request = http.request(options, function(res) {
        var data = "";

        if (Math.floor(res.statusCode / 100) === 2) {
            res.on('data', function (chunk) {
                data += chunk;
            });

            res.on('end', function () {
                deferred.resolve({data: data, headers: res.headers});
            });
        } else {
            deferred.reject("Cannot connect to " + options.host + ":" + options.port);
        }
    });

    request.on('error', function(e) {
        console.log("Got error: " + e.message);
        deferred.reject(e);
    });

    request.end();

    return deferred.promise;
};

exports.fetchMetaData = function(isbn) {
    var options = {
        host: 'dpd.scholastic.net',
        path: "/services/DPDService.cfc?wsdl&method=getXPSMetadata&isbn_13=" + isbn,
//        host: 'localhost',
//        path: "/Projects/scholastic.xml?isbn=" + isbn,
        port: 80
    };

    return exports.fetchData(options, false).then(function(response) {
        return response.data;
    });
};

exports.exec = function(command, options) {
    var deferred = Q.defer(),
        process;

    options = options || {};
    process = child_process.exec(command, options, function (error, stdout, stderr) {
        if (error !== null) {
            console.log("EXCEC COMMAND:", command)
            console.log('exec error: ' + error);
            console.log('stderr: ' + stderr);
            deferred.reject(error);
        } else {
            deferred.resolve(stdout);
        }
    });

    return deferred.promise;
};

exports.hash = function(data) {
    var md5Hash = crypto.createHash('md5');
    md5Hash.update(data);
    return md5Hash.digest('hex');
};

exports.random = function(length) {
    try {
        return crypto.randomBytes(length).toString("hex");
    } catch (error) {
        return null;
    }
};
