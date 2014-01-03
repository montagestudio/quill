/*jshint node:true */
/*
    ReadAloud specific extension.

    This is loaded by node and makes it possible to call aligner methods from quil.
    eg: self.backend.get("read-aloud").invoke("runAligner",....
    
 */
var Q = require("q"),
    childProcess = require('child_process'),
    AudioTextAligner = require("audio-aligner/lib/audio-text-aligner").AudioTextAligner;


var exec = exports.exec = function(command, options) {
    var deferred = Q.defer(),
        process;

    options = options || {};
    process = childProcess.exec(command, options, function(error, stdout, stderr) {
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

/**
 * Use this to get default North American English
 *  * Acoustic model
 *  * Dictionary model
 *
 * @param  {[type]} options HTTP post information
 * @return {[type]}         [description]
 */
var fetchLanguageModelsData = function(options) {
    var deferred = Q.defer();

    Q.nextTick(function() {

        //TODO contact Declarativ server, with license info and download models...
        deferred.resolve(true);
    });

    return deferred.promise;
};
exports.fetchLanguageModelsData = fetchLanguageModelsData;

var aligner;

var runAligner = exports.runAligner = function(options) {
    var deferred = Q.defer();

    Q.nextTick(function() {
        if (options.readingOrder) {
            options.text = "";
            options.text = options.readingOrder.map(function(item) {
                return item.text;
            }).join(" ").trim();
        }
        if (!options.text) {
            console.log("There is no text, resolving the reading order only.");
            options.alignmentResults = {
                "guesses": {},
                "info": "empty text, not running aligner"
            };
            deferred.resolve(options);
            return;
        }
        if (!options.voice) {
            console.log("There is no voice url, resolving the reading order only.");
            options.alignmentResults = {
                "guesses": {},
                "info": "missing voice audio url, not running aligner"
            };
            deferred.resolve(options);
            return;
        }
        if (!aligner) {
            aligner = new AudioTextAligner();
        }

        console.log("Decoding uri: "+ options.voice);
        options.voice = decodeURI(options.voice);
        console.log(options.voice);

        console.log("Running aligner..." + options.text + " " + options.voice);
        aligner.run(options.voice, options.text)
            .then(function(results) {
                // console.log("Results of calling runAligner ", results);
                options.alignmentResults = results;
                deferred.resolve(options);
            }, function(reason) {
                console.log("Failed to get alignment result.", reason);
                deferred.reject(reason);
            });
    });
    return deferred.promise;
};
