/*jshint node:true */

exports = module.exports = Object.create(require("adaptor/server/backend"));

var PATH = require("path"),
    Q = require("q"),
    QFS = require("q-io/fs"),
    child_process = require('child_process');

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

var exec = function(command, options) {
    var deferred = Q.defer(),
        process;

    options = options || {};
    process = child_process.exec(command, options, function (error, stdout, stderr) {
        if (error !== null) {
            console.log("EXCEC COMMAND:", command);
            console.log('exec error: ' + error);
            console.log('stderr: ' + stderr);
            deferred.reject(error);
        } else {
            deferred.resolve(stdout);
        }
    });

    return deferred.promise;
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
        });

        if (changed) {
            return QFS.write(filePath, data).then(function() {
                return issues;
            });
        }
        return issues;
    });
};

exports.createFromTemplate = function(template, destination, options, replaceExisting, _index) {
    var source = PATH.join(global.clientPath, template),
        dest = pathFromURL(destination),
        ext = PATH.extname(dest);

    if (ext.length) {
        dest = dest.substr(0, dest.length - ext.length);
    }
    if (_index !== undefined) {
        dest += " " + _index + ext;
    } else {
        dest += ext;
        _index = 0;
    }

    // Make sure the needed tree structure exist
    return QFS.makeTree(PATH.join(dest, "..")).then(function() {
        return QFS.exists(dest).then(function(exists) {
            if (exists) {
                if (replaceExisting) {
                    return QFS.removeTree(dest).then(function() {
                        return exports.createFromTemplate(template, destination, options, false);
                    });
                } else if (_index < 100) {
                    return exports.createFromTemplate(template, destination, options, false, _index + 1);
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
                    });
                });
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
                        type = "image/png";
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

                    // Special case for the cover image
                    if (name === "cover") {
                        properties = "cover-image";
                    }


                    name = name.replace(/[-_+.,;:]/g, "");
                    manifest.push('<item id="' + name + '" href="' + path + '"' + (properties !== null ? ' properties="' + properties + '"' : '') + ' media-type="' + type +'"/>');

                    if (path.indexOf("pages/") === 0) {
                        pages.push(name);
                    }
                }
            });
        });

        var prefixLength = "page".length,
            pageSpreads = ["page-spread-left", "page-spread-right"],
            pageNumber = 0;

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
            pageNumber ++;
            spine.push('<itemref idref="' + name + '" properties="' + pageSpreads[pageNumber % 2] + '"/>');
        });

        options.manifest = manifest;
        options.spine = spine;

        // We need to read every pages to check for SVG
        var pageIndex = 0,
            nbrPagesToRead = pageToRead.length;

        var checkNextFile = function() {
            return QFS.read(pageToRead[pageIndex].path).then(function(data) {
                if (data.search(/<svg /i) === -1) {
                    var i = -1;

                     // this page does not contains any SVG, let's remove the svg attribute from the manifest
                    manifest.some(function(line) {
                        i ++;

                        if (line.search('<item id="' + pageToRead[pageIndex].name + '"') !== -1) {
                            manifest[i] = line.replace(' properties="svg"', "");
                            return true;
                        }

                        return false;
                    });
                }

                if (++ pageIndex < nbrPagesToRead) {
                    return checkNextFile();
                }
            });
        };

        return checkNextFile().then(function() {
            return exports.customizeFile(PATH.join(root, "content.opf"), options).then(function() {
                return exports.customizeFile(PATH.join(root, "toc.ncx"), options).then(function() {
                    return exports.customizeFile(PATH.join(root, "nav.xhtml"), options);
                });
            });
        });
    });
};

exports.generateEPUB3 = function(rootDirectory, name) {
    var root = pathFromURL(rootDirectory),
        options = {cwd: root},
        result = "",
        i;

    i = name.indexOf(".pdf");
    if (i > 0) {
        name = name.substr(0, i);
    }
    name += ".epub";

    return exec("zip -X '" + name + "' mimetype", options).then(function(stdout) {
        result += stdout;
        return exec("zip -rg '" + name + "' META-INF -x \\*/.*", options).then(function(stdout) {
            result += stdout;
            return exec("zip -rg '" + name + "' OEBPS -x \\*/.*", options).then(function(stdout) {
                return result + stdout;
            });
        });
    });
};

exports.saveOriginalAssets = function(rootDirectory) {
    var root = pathFromURL(rootDirectory),
        source = PATH.join(root, "OEBPS", "assets"),
        dest = PATH.join(root, "original-assets");

    return QFS.exists(dest).then(function(exists) {
        if (exists === false) {
            return QFS.copyTree(source, dest);
        }
    });
};

exports.appendImagesInfo = function(rootDirectory, info) {
    var root = pathFromURL(rootDirectory);

    QFS.append(PATH.join(root, "image-index.txt"), JSON.stringify(info) + "\n");
    return true;
};

exports.getImagesInfo = function(rootDirectory) {
    var root = pathFromURL(rootDirectory);

    return QFS.read(PATH.join(root, "image-index.txt")).then(function(data) {
        var imagesInfo = {};

        data.split("\n").forEach(function(line) {
            try {
                var info = JSON.parse(line),
                    key;

                for (key in info) {
                    if (info.hasOwnProperty(key)) {
                        if (imagesInfo[key]) {
                            // merge usages
                            imagesInfo[key].usage.push.apply(imagesInfo[key].usage, info[key].usage);
                        } else {
                            imagesInfo[key] = info[key];
                        }
                    }
                }
            } catch(ex) {}
        });

        return imagesInfo;
    });
};

exports.optimizeImage = function(sourceURL, destURL, imageSize, quality) {
    var _USE_IMAGEMAGIK = false;

    if (_USE_IMAGEMAGIK) {
        var imageMagickRoot = PATH.resolve(__dirname, 'ImageMagick'),
            sourcePath = pathFromURL(sourceURL).replace(/ /g, "\\ "),
            destPath = pathFromURL(destURL).replace(/ /g, "\\ "),
            options = {
                cwd: PATH.join(imageMagickRoot, "bin"),
                env: {
                    MAGICK_HOME: imageMagickRoot,
                    DYLD_LIBRARY_PATH: PATH.join(imageMagickRoot, "lib/")
                }
            };

        return exec('./identify -format \'{"width":%w, "height":%h, "size":"%b"}\' ' + sourcePath, options).then(function(result) {
            var info = JSON.parse(result);
            info.size = parseInt(info.size, 10);

//            var unsharp = "0x0.75+0.75+0.008";
            var unsharp = "0x1.0+1.0+0.004";

            return exec('./convert ' + sourcePath + ' -filter spline -resize ' + imageSize.width + 'x' + imageSize.height + ' -unsharp ' + unsharp + ' ' + destPath, options).then(function(){
//            return exec('./convert ' + sourcePath + ' -adaptive-resize ' + imageSize.width + 'x' + imageSize.height + ' ' + destPath, options).then(function(){
                return exec('./identify -format \'{"width":%w, "height":%h, "size":"%b"}\' ' + destPath, options).then(function(result) {
                    var newInfo = JSON.parse(result);
                    newInfo.size = parseInt(newInfo.size, 10);

                    return newInfo;
                });
            });
        });
    } else {
        return global.sendCommandToParentProcess("scaleImage", {sourceURL: sourceURL, destinationURL: destURL, size: imageSize, quality: quality || 0.6}, true);
    }
};

exports.getCoverImage = function(rootDirectory) {
    var root = pathFromURL(rootDirectory),
        coverImagePath = PATH.join(root, "OEBPS", "assets", "cover.jpeg");

    return QFS.exists(coverImagePath).then(function(exists) {
        if (exists) {
            return "fs://localhost" + coverImagePath;
        }

        return null;
    });
};
