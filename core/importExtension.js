var Montage = require("montage/core/core").Montage;

exports.ImportExtension = Montage.specialize({

    /*
        Return a promise which will provide a dictionary of meta data for the specific item
     */
    getMetaData: {
        value: function(item) {
            var deferred = Q.defer();

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
            var deferred = Q.defer();

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
            var deferred = Q.defer();

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
            var deferred = Q.defer();

            deferred.resolve(item.id);
            return deferred.promise;
        }
    }

});

