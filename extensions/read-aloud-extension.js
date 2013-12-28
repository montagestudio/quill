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
                self = this,
                pageIndex = 1,
                onePageAtATime = true;

            Promise.nextTick(function() {
                if (onePageAtATime) {
                    var recursivelyRunReadAloudUntilDone = function(pageIndex) {
                        if (pageIndex < item.nbrPages) {
                            self._addReadAloudToPage(backend, item, pageIndex).done(function() {
                                console.log("Done page " + pageIndex);
                                pageIndex = pageIndex + 1;
                                recursivelyRunReadAloudUntilDone(pageIndex);
                            });
                        } else {
                            console.log("Done batch running the read aloud.");
                            deferred.resolve(item.id);
                        }
                    };
                    recursivelyRunReadAloudUntilDone(pageIndex);
                } else {
                    for (pageIndex = 1; pageIndex < item.nbrPages; pageIndex++) {
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
                }

            });
            return deferred.promise;
        }
    },

    _updateReadAloudStatus: {
        value: function(backend, item, pageNumber, deferred, message) {
            var pauseInCaseWebSocketClosed = 500;

            if (message === "Error calling runAligner ") {
                console.log("This page " + pageNumber + " might have crashed the websocket, tried waiting 15 seconds for socket to come back online before going to next page. But it doesnt seem to come back after a seg fault...");
                pauseInCaseWebSocketClosed = 15000;
            }

            setTimeout(function() {
                console.log("Updating generatingAudioAlignment");
                var ipc = backend.get("ipc");

                item.currentPage = item.currentPage + 1;
                item.status = IMPORT_STATES.generatingAudioAlignment;
                ipc.invoke("namedProcesses", "monitor").then(function(processID) {
                    console.log("Sending generatingAudioAlignment update.");
                    if (processID) {
                        return ipc.invoke("send", item.processID, processID[0], ["itemUpdate", item]);
                    }
                }, function(e) {
                    console.log("ERROR UPDATING IMPORT STATE:", e.message, e.stack);
                }).done(function() {
                    deferred.resolve(message + pageNumber);
                });

            }, pauseInCaseWebSocketClosed);
        }
    },

    _addReadAloudToPage: {
        value: function(backend, item, pageNumber) {
            var deferred = Promise.defer(),
                self = this;

            Promise.nextTick(function() {
                console.log("*** Requesting read aloud for page " + pageNumber);

                var pageURL = item.destination + "/OEBPS/pages/" + pageNumber + ".xhtml",
                    smilUrl = item.destination + "/OEBPS/overlay/" + pageNumber + ".smil",
                    jsonUrl = item.destination + "/read-aloud-data/json/" + pageNumber + ".json",
                    readAlong = new ReadAlong();

                readAlong.readingOrder.loadFromXHTML(pageURL).then(function(order) {
                    if (!order || order.length <= 0) {
                        self._updateReadAloudStatus(backend, item, pageNumber, deferred, "No reading order in ");
                        return;
                    }

                    console.log("Recieved non-empty reading order for " + pageNumber);
                    readAlong.xhtmlUrl = pageURL;
                    readAlong.triggerAlignerWithReadingOrder().then(function(resultingBestGuessedReadingOrder) {

                        console.log("\tResults of calling runAligner on page " + pageNumber, resultingBestGuessedReadingOrder);
                        if (resultingBestGuessedReadingOrder && resultingBestGuessedReadingOrder.length > 0) {

                            console.log("ready to save smil for " + pageNumber);
                            readAlong.convertToSMIL(resultingBestGuessedReadingOrder).then(function(smilContents) {
                                var flags = {
                                    flags: "w",
                                    charset: 'utf-8'
                                };
                                backend.get("fs").invoke("write", smilUrl.substring("fs://localhost".length), smilContents, flags).then(function(x) {
                                    console.log("Saved smil file: " + smilUrl), x;
                                }, function(error) {
                                    console.log("There was an error saving smil file." + pageNumber, error);
                                }).done(function() {
                                    self._updateReadAloudStatus(backend, item, pageNumber, deferred, "Saved smil file: ");
                                });
                            }, function(error) {
                                console.log("There was an error build smil contents." + pageNumber);
                                console.log(error);
                                self._updateReadAloudStatus(backend, item, pageNumber, deferred, "There was an error building smil contents.");
                            });

                        } else {
                            self._updateReadAloudStatus(backend, item, pageNumber, deferred, "Got no results on page ");
                        }

                    }, function(error) {
                        console.log("Error calling runAligner ", error);
                        self._updateReadAloudStatus(backend, item, pageNumber, deferred, "Error calling runAligner ");
                    });

                }, function(error) {
                    console.log("Error getting reading order.", error);
                    self._updateReadAloudStatus(backend, item, pageNumber, deferred, "Error getting reading order ");
                });

            });
            return deferred.promise;
        }
    }

});