/* global global */
var PATH = require("path"),
    fs = require("fs"),
    Q = require("q"),
    QFS = require("q-io/fs"),
    minimatch = require('minimatch');


var guard = function (exclude) {
    exclude = exclude || [];
    var minimatchOpts = {matchBase: true};
    return function (path) {
        // make sure none of the excludes match
        return exclude.every(function (glob) {
            return !minimatch(path, glob, minimatchOpts);
        }) ? true : null; // if false return null so directories aren't traversed
    };
};

/**
 * Lists all the files in the given path except node_modules and dotfiles.
 * @param  {string} path An absolute path to a directory.
 * @return {Promise.<Array.<string>>} A promise for an array of paths.
 */
exports.listTree = function (path, extraExclude) {
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

exports.list = function (path) {
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
