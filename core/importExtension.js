var Montage = require("montage/core/core").Montage;
var Promise = require("montage/core/promise").Promise;

exports.ImportExtension = Montage.specialize({
    /*
        Initialize the extension (do not return a promise)
     */
    initialize: {
        value: function(backend) {
        }
    },


    /*
        Return a promise which will return a boolean to indicated if the requested operation can be performed
        (hook for checking user license)
     */
    canPerformOperation: {
        value: function(backend, operation, params) {
            var deferred = Promise.defer();
            deferred.resolve(true);
            return deferred.promise;
        }
    },

    /*
        Return a promise which will provide a dictionary of meta data for the specific item
     */
    getMetaData: {
        value: function(item) {
            var deferred = Promise.defer();

            deferred.resolve({id: item.id, metadata: null});
            return deferred.promise;
        }
    },

    /*
        Give an opportunity to do some custom work once all page have been converted to HTML, but before the ebook has been generated
        This is called only once. Must return a promise
     */
    customizePages: {
        value: function(item) {
            var deferred = Promise.defer();

            deferred.resolve(item.id);
            return deferred.promise;
        }
    },


    /*
        Give an opportunity to do some custom work once all assets have been optimized, but before the ebook has been generated
        This is called only once. Must return a promise
     */
    customizeAssets: {
        value: function(item) {
            var deferred = Promise.defer();

            deferred.resolve(item.id);
            return deferred.promise;
        }
    },


     /*
        Called when all the pieces of the ebook are ready (pages, assets, table of content, etc..., but before the ebook has been generated
        This is called only once. Must return a promise
     */
    customizeEbook: {
        value: function(item) {
            var deferred = Promise.defer();

            deferred.resolve(item.id);
            return deferred.promise;
        }
    }

});

