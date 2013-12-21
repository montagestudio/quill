/*jshint node:true */
/*
    ReadAloud specific extension
 */

var Q = require("q"),
    QFS = require("q-io/fs"),
    PATH = require("path"),
    HTTP = require("http"),
    HTTPS = require("https"),
    child_process = require('child_process'),
    crypto = require('crypto');


var guard = function(dialectId) {
    return function(path) {
        var fileName = PATH.basename(path),
            expr = new RegExp("[\b-_]*(covers?|" + dialectId + ")[\b-_]*", "i"),
            matches = fileName.match(expr);

        if (matches) {
            if (fileName.indexOf(dialectId) !== -1) {
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
    Use codes from http://en.wikipedia.org/wiki/ISO-language-codes
 */
var isValiddialectId = function(dialectIdentifier) {
    var availableDialectsForThisLicenseExample = ["en-US", "en-GB", "es", "fr"];
    var availableDialectsForThisLicense = ["en-US"];
    return availableDialectsForThisLicense.indexOf(dialectIdentifier) > -1;
}

exports.getDialectIdFromFile = function(filePath) {
    return "en-US";
};

exports.fetchData = function(options, secure) {
    var deferred = Q.defer(),
        http = (secure === true) ? HTTPS : HTTP;

    var request = http.request(options, function(res) {
        var data = "";

        if (Math.floor(res.statusCode / 100) === 2) {
            res.on('data', function(chunk) {
                data += chunk;
            });

            res.on('end', function() {
                deferred.resolve({
                    data: data,
                    headers: res.headers
                });
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

exports.fetchMetaData = function(dialectId) {
    var options = {
        host: 'lm.declartiv.com',
        path: "/services/langaugeModels=" + dialectId,
        //        host: 'localhost',
        //        path: "/Projects/ReadAloud.xml?dialectId=" + dialectId,
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
    process = child_process.exec(command, options, function(error, stdout, stderr) {
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