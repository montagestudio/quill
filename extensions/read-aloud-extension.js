/*jshint camelcase:false, maxcomplexity:16 */ // TODO: fix these warnings
var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    ImportExtension = require("core/ImportExtension").ImportExtension;

exports.ReadAloudExtension = Montage.create(ImportExtension, {
    initialize: {
        value: function(backend) {
            backend.get("read-aloud").invoke("runAligner", {}).then(function(results) {
                console.log("Results of calling runAligner", results);
            }, function(error) {
                console.log("Error calling runAligner", error);
            });
        }
    },

    customizePages: {
        value: function(backend, item) {
            var deferred = Promise.defer();
            console.log("*** customizePages");
            deferred.resolve(item.id);
            return deferred.promise;
        }
    },

    customizeAssets: {
        value: function(backend, item) {
            var deferred = Promise.defer();
            console.log("*** customizeAssets");
            deferred.resolve(item.id);
            return deferred.promise;
        }
    },

    customizeEbook: {
        value: function(backend, item) {
            var deferred = Promise.defer();
            console.log("*** customizeEbook", item);
            return deferred.resolve(item.id);
        }
    }

});