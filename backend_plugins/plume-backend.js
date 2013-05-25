/* global global */
var PATH = require("path"),
    fs = require("fs"),
    Q = require("q"),
    QFS = require("q-io/fs"),
    minimatch = require('minimatch');


var guard = function(exclude) {
    exclude = exclude || [];
    var minimatchOpts = {matchBase: true};
    return function (path) {
        // make sure none of the excludes match
        return exclude.every(function (glob) {
            return !minimatch(path, glob, minimatchOpts);
        }) ? true : null; // if false return null so directories aren't traversed
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
}

/**
 * Lists all the files in the given path except node_modules and dotfiles.
 * @param  {string} path An absolute path to a directory.
 * @return {Promise.<Array.<string>>} A promise for an array of paths.
 */
exports.listTree = function(path, extraExclude) {
    var exclude = ["node_modules", ".*"];

    if (extraExclude && !(extraExclude instanceof Array)) {
        extraExclude = [extraExclude];
    }
    if (extraExclude) {
        exclude = exclude.concat(extraExclude);
    }

    return QFS.listTree(path, guard(exclude)).then(function (paths) {
        return Q.all(paths.map(function (path) {
            return QFS.stat(path).then(function (stat) {
                return {url: "fs://localhost" + path, stat: stat};
            });
        }));
    });
};

exports.list = function(path) {
    return QFS.list(path).then(function (filenames) {

        filenames = filenames.filter(function (name) {
            return !(/^\./).test(name);
        });

        return Q.all(filenames.map(function (filename) {
            var fullPath = PATH.join(path, filename);
            return QFS.stat(fullPath).then(function (stat) {
                return {url: "fs://localhost" + fullPath, stat: stat};
            });
        }));
    });
};

exports.customizeFile = function(fileURL, options) {
    var filePath = pathFromURL(fileURL),
        issues = [];

    options = options || {};

    return QFS.read(filePath).then(function(data) {
        var changed = false;

        data = data.replace(/{{([a-zA-Z-_]*)}}/g, function(match, key) {
            var value = "{{" + key + "}}";

            if (options[key] !== undefined) {
                value = options[key];
                changed = true;
            } else {
                issues.push("unresolved template's variable \"" + key + "\" in " + filePath);
            }

            if (value instanceof Array) {
                // JFD TODO: we need to preserve the indenting
                value = value.join("\n");
            }

            return value;
        })

        if (changed) {
            return QFS.write(filePath, data).then(function() {
                return issues;
            });
        }
        return issues;
    })
};

exports.createFromTemplate = function(template, destination, options, _index) {
console.log("--- createFromTemplate")
    var source = PATH.join(global.clientPath, template),
        dest = pathFromURL(destination);

    if (_index !== undefined) {
        dest += " " + _index;
    } else {
        _index = 0;
    }

    // Make sure the needed tree structure exist
    return QFS.makeTree(PATH.join(dest, "..")).then(function() {
        return QFS.exists(dest).then(function(exists) {
            if (exists) {
                if (_index < 100) {
                    return exports.createFromTemplate(template, destination, options, _index + 1);
                }
                throw new Error("destination directory already exist!");
            }

            return QFS.copyTree(source, dest).then(function(result) {
                return exports.listTree(dest).then(function(tree) {
                    var promises = [],
                        issues = [];
                    tree.forEach(function(item) {
                        if (item.stat.isFile()) {
                            promises.push(exports.customizeFile(item.url, options));
                        }
                    });

                    return Q.all(promises).then(function(results) {
                        console.log("RESULTS:", results);
                        results.forEach(function(result) {
                            issues.push.apply(issues, result);
                        });
                        return {url:"fs://localhost" + dest, issues:issues};
                    })
                })
            });
        });
    });
};

exports.updateContentInfo = function(rootDirectory, options) {
    console.log("--- updateContentInfo #1", rootDirectory);

    var root = PATH.join(pathFromURL(rootDirectory), "OEBPS"),
        directories = ["assets", "pages", "styles"],
        listPromises = [];

    console.log("--- updateContentInfo #2", root);

    options = options || {};

    directories.map(function(directoryName) {
        console.log("--- updateContentInfo #3", PATH.join(root, directoryName));
//        listPromises.push(QFS.listTree(PATH.join(root, directoryName), guard(exclude)));
        listPromises.push(exports.listTree(PATH.join(root, directoryName)));
    });

    return Q.all(listPromises).then(function(results) {
        var manifest = [],
            spine = [],
            pages = [];

        results.map(function(files) {
            files.map(function(file) {
                if (file.stat.isFile()) {
//                    allFiles.push(PATH.relative(root, pathFromURL(file.url)));
                    var path = PATH.relative(root, pathFromURL(file.url)),
                        name = PATH.basename(path),
                        ext = PATH.extname(name),
                        type = "application/octet-stream";

                    switch (ext.toLowerCase()) {
                        case ".html":    type = "text/html";                     break;
                        case ".xhtml":   type = "application/xhtml+xml";         break;
                        case ".css":     type = "text/css";                      break;
                        case ".jpeg":    type = "image/jpeg";                    break;
                    }
                    manifest.push('<item id="' + name + '" href="' + path + '" media-type="' + type +'"/>');

                    if (path.indexOf("pages/") === 0) {
                        pages.push(name);
                    }
                }
            });
        });

        pages.sort(function(a, b) {
            a = parseInt(a, 10);
            b = parseInt(b, 10);

            if (a < b) {
                return -1;
            } else if (a > b) {
                return 1;
            } else {
                return 0;
            }
        }).map(function(name) {
            spine.push('<itemref idref="' + name + '"/>');
        });

        options.manifest = manifest;
        options.spine = spine;

        return exports.customizeFile(PATH.join(root, "content.opf"), options);
    });
};