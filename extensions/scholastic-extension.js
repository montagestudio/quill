var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    ImportExtension = require("core/ImportExtension").ImportExtension;

exports.ScholasticExtension = Montage.create(ImportExtension, {
    getMetaData: {
        value: function(backend, item) {
            var deferred = Promise.defer();

            backend.get("scholastic").invoke("getISBNFromFile", item.url).then(function(isbn) {
                if (isbn) {
                    item.isbn = isbn;

                    return backend.get("scholastic").invoke("fetchMetaData", isbn).then(function(response) {
                        var parser = new DOMParser(),
                            xmlDoc,
                            data;

                        console.log("XML:", response)
                        try {
                            xmlDoc = parser.parseFromString(response, "text/xml");

                            var rootNodes = xmlDoc.getElementsByTagName("XPSMetadata"),
                                nodes = rootNodes ? rootNodes[0].childNodes : [],
                                nbrNodes = nodes.length,
                                i,
                                metadata = {};

                            var scholasticNameToPlumeName = {
                                "contributor_Statement": "document-author",
                                "isbn_13": "book-id",
                                "language": "document-language",
                                "publisher": "document-publisher",
                                "title": "document-title"

                                // JFD TODO: add more names as needed
                            }

                            for (i = 0; i < nbrNodes; i ++) {
                                var node = nodes[i],
                                    name = scholasticNameToPlumeName[node.nodeName] || node.nodeName,
                                    value = node.textContent;

                                // Convert string to int or float
                                if (/\d/.test(value) && /^[+-]?\d*\.?\d*$/.test(value)) {
                                    value = parseFloat(value);
                                }

                                if (metadata[name] === undefined) {
                                    metadata[name] = value;
                                } else {
                                    if (metadata[name] instanceof Array) {
                                        metadata[name].push(value);
                                    } else {
                                        metadata[name] = [metadata[name], value];
                                    }
                                }
                            }

                            deferred.resolve({id: item.id, metadata: metadata});
                        } catch(error) {
                            console.log("ERROR:", error)
                            deferred.reject({id: item.id, error: error});
                        }
                    }, function(error) {
                        deferred.reject({id: item.id, error: error});
                    });
                } else {
                    deferred.resolve({id: item.id});
                }
            }, function(error) {
//                deferred.reject({id: item.id, error: error});
                // JFD TODO: for now, if you try to convert a file that is not a typical scholastic filename, let's just ignore the metadata
                deferred.resolve({id: item.id});
            }).done();

            return deferred.promise;
        }
    },

    customizePages: {
        value: function(backend, item) {
            var deferred = Promise.defer();

            console.log("*** customizePages", backend);
            // Let setup a cover image

            backend.get("scholastic").invoke("setupCoverPage", item).then(function(success) {
                deferred.resolve(item.id);
            }, function(error) {
                deferred.reject(error);
            });

            return deferred.promise;
        }
    },

    customizeAssets: {
        value: function(backend, item) {
            var deferred = Promise.defer();

            console.log("*** customizeAssets");
            // JFD TODO: write me

            deferred.resolve(item.id);
            return deferred.promise;
        }
    },

    customizeEbook: {
        value: function(backend, item) {
            var deferred = Promise.defer();

            console.log("*** customizeEbook");
            // JFD TODO: write me

            deferred.resolve(item.id);
            return deferred.promise;
        }
    }

});

