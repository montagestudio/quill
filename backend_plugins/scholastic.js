/*jshint node:true */
/*
    Scholastic specific extension
 */

var Q = require("q"),
    QFS = require("q-io/fs"),
    PATH = require("path"),
    HTTP = require("http");


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
    })

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
};

exports.getISBNFromFile = function (filePath) {
    var values = PATH.basename(filePath, ".pdf").replace(/[-\s]/g,'').match(/[0-9]*/),
        isbn = null;

    values.some(function(value) {
        if (value.length == 13) {
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

exports.setupCoverPage = function(item) {
    var filePath = pathFromURL(item.url),
        isbn = item.isbn,
        root = PATH.dirname(filePath);

    return QFS.listTree(root, guard(isbn)).then(function (paths) {
        if (paths && paths.length) {
            // Copy the cover file
            // JFD TODO: optimize cover image
            var destPath = PATH.join(pathFromURL(item.destination), "OEBPS", "assets", "cover.jpeg"),
                destURL = (item.destination + "/OEBPS/assets/cover.jpeg").replace(/ /g, "%20");
            return QFS.copy(paths[0], destPath).then(function() {
                return global.sendCommandToParentProcess("getImageInfo", {url: destURL}, true).then(function(info) {
                    console.log("IMAGE INFO:", info);
                    var width = info.width,
                        height = info.height,
                        ratio = 1024 / Math.max(width, height);

                    if (ratio < 1) {
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                        return global.sendCommandToParentProcess("scaleImage", {sourceURL: destURL, destinationURL: destURL, size: {width: width, height: height}, quality: 0.6}, true);
                    }
                    return true;
                });
            });
        }
        return paths;
//        return Q.all(paths.map(function (path) {
//            return QFS.stat(path).then(function (stat) {
//                return {url: "fs://localhost" + path, stat: stat};
//            });
//        }));
    });
};

exports.fetchMetaData = function(isbn) {
    var deferred = Q.defer();

    var options = {
        host: 'dpd.scholastic.net',
        path: "/services/DPDService.cfc?wsdl&method=getXPSMetadata&isbn_13=" + isbn,
//        host: 'localhost',
//        path: "/Projects/scholastic.xml?isbn=" + isbn,
        port: 80
    }

    var request = HTTP.request(options, function(res) {
        var data = "";
//        res.setEncoding('utf8');

        if (res.statusCode == 200) {
            res.on('data', function (chunk) {
                data += chunk;
            });

            res.on('end', function () {
                console.log('DATA: ', data);
                deferred.resolve(data);
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
}

//exports.scholastic = function() {
//    return true;
//};
//
//exports.preProcessing = function(item) {
//    var filePath = pathFromURL(item.url),
//        isbn = getISBNFromFile(filePath);
//
//    if (isbn) {
//        return fetchMetaData(isbn).then(function(mataData) {
//            // JFD TODO: fill up the metadata
////            return item;
//            return mataData;
//        });
//    }
//
//    return item;
//}
//
//exports.postProcessing = function(item) {
//    var filePath = pathFromURL(item.url),
//        isbn = getISBNFromFile(filePath);
//
//    if (isbn) {
//        return findCoverPage(item, isbn).then(function() {
//            return item;
//        });
//    }
//
//    return item;
//}
