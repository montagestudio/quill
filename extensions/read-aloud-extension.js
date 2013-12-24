/*jshint camelcase:false, maxcomplexity:16 */ // TODO: fix these warnings
var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    ImportExtension = require("core/ImportExtension").ImportExtension,
    IMPORT_STATES = require("core/importStates").importStates,
    ReadAlong = require("core/read-along").ReadAlong;

exports.ReadAloudExtension = Montage.create(ImportExtension, {

    /* Hooks for Extensions */
    initialize: {
        value: function(backend) {
            console.log("Inializing Read Aloud Extension");
        }
    },

    customizePages: {
        value: function(backend, item) {
            var deferred = Promise.defer(),
                self = this;

            console.log("*** customizePages with Read Aloud");

            //HACK to change the progress bar... otherwise it looks like it hangs
            var ipc = backend.get("ipc");
            item.currentPage = 1;
            item.status = IMPORT_STATES.generatingAudioAlignment;
            ipc.invoke("namedProcesses", "monitor").then(function(processID) {
                if (processID) {
                    return ipc.invoke("send", item.processID, processID[0], ["itemUpdate", item]);
                }
            }, function(e) {
                console.log("ERROR UPDATING IMPORT STATE:", e.message, e.stack);
            });

            Promise.nextTick(function() {
                self._addReadAloudToEPub(backend, item).then(function() {
                    console.log("Customized ePub with Read Aloud when applicable.");
                    deferred.resolve(item.id);
                }, function(error) {
                    console.log("Was not able to run the read aloud processes");
                    deferred.resolve(item.id);
                });
            });
            return deferred.promise;
        }
    },

    customizeAssets: {
        value: function(backend, item) {
            var deferred = Promise.defer();
            Promise.nextTick(function() {
                console.log("*** customizeAssets with Read Aloud");
                deferred.resolve(item.id);
            });
            return deferred.promise;
        }
    },

    customizeEbook: {
        value: function(backend, item) {
            var deferred = Promise.defer();
            Promise.nextTick(function() {
                console.log("*** customizeEbook with Read Aloud");
                deferred.resolve(item.id);
            });
            return deferred.promise;
        }
    },

    /* Internal Methods for Read Aloud Batch Processing Extension  */
    _addReadAloudToEPub: {
        value: function(backend, item) {
            var promises = [],
                deferred = Promise.defer(),
                self = this;

            Promise.nextTick(function() {
                for (var pageIndex = 1; pageIndex < item.nbrPages; pageIndex++) {
                    promises.push(self._addReadAloudToPage(backend, item, pageIndex));
                }
                Promise.allSettled(promises).then(function(result) {
                    console.log("Success of all pages when batch running the read aloud.", result);
                }, function(error) {
                    console.log("Error on some pages when batch running the read aloud.", error);
                }).done(function() {
                    console.log("Done batch running the read aloud.");
                    deferred.resolve(item.id);
                });
            });
            return deferred.promise;
        }
    },

    _addReadAloudToPage: {
        value: function(backend, item, pageNumber) {
            var deferred = Promise.defer();

            Promise.nextTick(function() {
                console.log("*** Requesting read aloud for page " + pageNumber);

                var pageURL = item.destination + "/OEBPS/pages/" + pageNumber + ".xhtml",
                    smilUrl = item.destination + "/OEBPS/overlay/" + pageNumber + ".smil",
                    jsonUrl = item.destination + "/json/" + pageNumber + ".json",
                    readAlong = new ReadAlong();

                readAlong.readingOrder.loadFromXHTML(pageURL).then(function(order) {
                    if (!order || order.length <= 0) {
                        deferred.resolve("No reading order in " + pageNumber);
                        return;
                    }

                    console.log("Recieved non-empty reading order for " + pageURL);
                    readAlong.xhtmlUrl = pageURL;

                    readAlong.triggerAlignerWithReadingOrder().then(function(results) {
                        console.log("\tResults of calling runAligner on page " + pageNumber, results);
                        //TODO save smil here
                        if (results) {
                            console.log("ready to save smil ");
                            // console.log("ready to save smil " + JSON.stringify(results, null, 2));
                            deferred.resolve("got " + results.length + " results on page " + pageNumber);
                        } else {
                            deferred.resolve("got no results on page " + pageNumber);
                        }
                    }, function(error) {
                        console.log("Error calling runAligner", error);
                    }).done(function() {
                        var ipc = backend.get("ipc");

                        //HACK to change the progress bar... otherwise it looks like it hangs
                        item.currentPage = pageNumber + 1;
                        item.status = IMPORT_STATES.generatingAudioAlignment;
                        ipc.invoke("namedProcesses", "monitor").then(function(processID) {
                            console.log("Sending generatingAudioAlignment update.");
                            if (processID) {
                                return ipc.invoke("send", item.processID, processID[0], ["itemUpdate", item]);
                            }
                        }, function(e) {
                            console.log("ERROR UPDATING IMPORT STATE:", e.message, e.stack);
                        }).done(function() {
                            deferred.resolve("All done with page " + pageNumber);
                        });
                    });

                }, function(error) {
                    console.log("Error getting reading order.", error);
                    deferred.resolve("Error getting reading order in page " + pageNumber);
                });


            });
            return deferred.promise;
        }
    }

});