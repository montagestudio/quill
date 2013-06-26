/* global global */
var PATH = require("path"),
    fs = require("fs"),
    Q = require("q"),
    QFS = require("q-io/fs"),
    minimatch = require('minimatch'),
    child_process = require('child_process');


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

var exec = function(command, options) {
    var deferred = Q.defer(),
        process;

    console.log("EXCEC COMMAND:", command)
    options = options || {};
    process = child_process.exec(command, options, function (error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        if (error !== null) {
            console.log('exec error: ' + error);
            console.log('stderr: ' + stderr);
            deferred.reject(error);
        } else {
            deferred.resolve(stdout);
        }
    });

    return deferred.promise;
};


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
    var root = PATH.join(pathFromURL(rootDirectory), "OEBPS"),
        directories = ["assets", "pages", "styles"],
        listPromises = [];

    options = options || {};

    directories.map(function(directoryName) {
        listPromises.push(exports.listTree(PATH.join(root, directoryName)));
    });

    return Q.all(listPromises).then(function(results) {
        var manifest = [],
            spine = [],
            pages = [],
            pageToRead = [];

        results.map(function(files) {
            files.map(function(file) {
                if (file.stat.isFile()) {
//                    allFiles.push(PATH.relative(root, pathFromURL(file.url)));
                    var path = PATH.relative(root, pathFromURL(file.url)),
                        ext = PATH.extname(path),
                        name = PATH.basename(path, ext ? ext : undefined),
                        firstChar = name.charAt(0),
                        type = "application/octet-stream",
                        properties = null;

                    switch (ext.toLowerCase()) {
                        case ".html":
                            type = "text/html";
                            if (firstChar <= "A") {
                                name = "page" + name;
                            }
                            break;
                        case ".xhtml":
                            type = "application/xhtml+xml";
                            if (firstChar <= "A") {
                                name = "page" + name;
                            }
                            // Set the SVG property for now, we will remove it later is not needed
                            properties = "svg";
                            console.log("PAGE FILE PATH:", pathFromURL(file.url))
                            pageToRead.push({
                                name: name,
                                path: pathFromURL(file.url)
                            });
                            break;
                        case ".css":
                            type = "text/css";
                            if (firstChar <= "A") {
                                name = "style" + name;
                            }
                            break;
                        case ".jpeg":
                            type = "image/jpeg";
                            if (firstChar <= "A") {
                                name = "image" + name;
                            }
                            break;
                        case ".png":
                            type = "image/jpeg";
                            if (firstChar <= "A") {
                                name = "image" + name;
                            }
                            break;
                        case ".otf":
                            type = "font/opentype";
                            if (firstChar <= "A") {
                                name = "font" + name;
                            }
                            break;
                    }

                    name = name.replace(/[-_+.,;:]/g, "");
                    manifest.push('<item id="' + name + '" href="' + path + '"' + (properties !== null ? ' properties="' + properties + '"' : '') + ' media-type="' + type +'"/>');

                    if (path.indexOf("pages/") === 0) {
                        pages.push(name);
                    }
                }
            });
        });

        var prefixLength = "page".length;
        pages.sort(function(a, b) {
            a = parseInt(a.substr(prefixLength), 10);
            b = parseInt(b.substr(prefixLength), 10);

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

        // We need to read every pages to check for SVG
        var pageIndex = 0,
            nbrPagesToRead = pageToRead.length;

        var checkNextFile = function() {
            return QFS.read(pageToRead[pageIndex].path).then(function(data) {
                if (data.search(/<svg /i) == -1) {
                    var i = -1;

                     // this page does not contains any SVG, let's remove the svg attribute from the manifest
                    manifest.some(function(line) {
                        console.log("checking line:", line)
                        i ++;

                        if (line.search('<item id="' + pageToRead[pageIndex].name + '"') !== -1) {
                            manifest[i] = line.replace(' properties="svg"', "");

                            console.log("find line:", line);
                            return true;
                        }

                        return false;
                    });
                }

                if (++ pageIndex < nbrPagesToRead) {
                    return checkNextFile();
                }
            })
        }

        return checkNextFile().then(function() {
            return exports.customizeFile(PATH.join(root, "content.opf"), options).then(function() {
                return exports.customizeFile(PATH.join(root, "toc.ncx"), options)
            });
        });
    });
};

exports.generateEPUB3 = function(rootDirectory, options) {
    var root = pathFromURL(rootDirectory),
        name,
        options = {cwd: root},
        result = "",
        i;

    name = PATH.basename(rootDirectory);
    i = name.indexOf(".ebook");
    if (i > 0) {
        name = name.substr(0, i);
    }
    name += ".epub";

    console.log("CMD:", "zip -X '" + name + "' mimetype", root)

    return exec("zip -X '" + name + "' mimetype", options).then(function(stdout) {
        result += stdout;
        return exec("zip -rg '" + name + "' META-INF -x \\*/.*", options).then(function(stdout) {
            result += stdout;
            return exec("zip -rg '" + name + "' OEBPS -x \\*/.*", options).then(function(stdout) {
                return result + stdout;
            });
        });
    });
}
