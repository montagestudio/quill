/*jshint node:true */
/*
    ReadAloud specific extension
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

        console.log("Running aligner...");

        if (options.readingOrder) {
            options.text = "";
            options.text = options.readingOrder.map(function(item) {
                return item.text;
            }).join(" ");
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

        // TODO verify the .raw, if its not there, create it?

        console.log("Running the voice audio " + options.voice);
        if (!aligner) {
            aligner = new AudioTextAligner();
        }

        aligner.run(options.voice, options.text)
            .then(function(results) {
                console.log("Results of calling runAligner", results);
                options.alignmentResults = results;
                deferred.resolve(options);
            }, function(reason) {
                console.log("Failed to get alignment result.", reason);
                deferred.reject(reason);
            });
    });
    return deferred.promise;
};

var getAudioDuration = exports.getAudioDuration = function(audioUrl) {
    return exec("ffprobe " + audioUrl);
};

var convertToRawAudio = exports.convertToRawAudio = function(sourceAudioUrl, destAudioUrl) {
    return exec("ffmpeg -i " + sourceAudioUrl + " -ac 1 -f s16le -ar 16k  " + destAudioUrl);
};