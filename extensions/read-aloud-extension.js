/*jshint camelcase:false, maxcomplexity:16 */ // TODO: fix these warnings
var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    ImportExtension = require("core/ImportExtension").ImportExtension;

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
            Promise.nextTick(function() {
                self._addReadAloudToEPub(backend, item).then(function() {
                    console.log("Customized ePub with Read Aloud when applicable.");
                    deferred.resolve(item.id);
                }).done(function(error) {
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
                    promises.push(self._addReadAloudToPage(backend, pageIndex));
                }
                Promise.allSettled(promises).then(function(result) {
                    console.log("Success of all pages when batch running the read aloud.", result);
                }, function(error) {
                    console.log("Error on some pages when batch running the read aloud.", error);
                }).done(function(result) {
                    console.log("Done batch running the read aloud.", result);
                    deferred.resolve(item.id);
                });
            });
            return deferred.promise;
        }
    },

    _addReadAloudToPage: {
        value: function(backend, pageNumber) {
            var deferred = Promise.defer();

            Promise.nextTick(function() {
                console.log("*** Extracting read aloud for page " + pageNumber);

                backend.get("read-aloud").invoke("runAligner", {}).then(function(results) {
                    console.log("Results of calling runAligner", results);
                    deferred.resolve("All done with page " + pageNumber);
                }, function(error) {
                    console.log("Error calling runAligner", error);
                    deferred.reject(error);
                });

            });
            return deferred.promise;
        }
    }

});