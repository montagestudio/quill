/*jshint camelcase:false, maxcomplexity:16 */ // TODO: fix these warnings
var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    ImportExtension = require("core/ImportExtension").ImportExtension,
    IMPORT_STATES = require("core/importStates").importStates,
    ReadAlong = require("core/read-along").ReadAlong;

var g_validLicense = null; // Null = need to check the license, true = licence ok, false = invalid license

var g_TrialPeriod = 10; //in days

var g_local_secret_hash_key = "e9161e517f3db0bed9ecf45f634f1f25";
var g_remote_secret_hash_key = "cdc1421b4468131ec9411b8522b1df61";

var g_assumeOneAudioPerPage = true;
var MP3_EXTENSION = ".mp3";

var _storeExpirationDate = function(readAloud, expiration) {
    expiration = expiration.getTime().toString(16);

    return readAloud.invoke("random", 4).then(function(salt) {
        return readAloud.invoke("hash", salt + g_local_secret_hash_key + expiration).then(function(hash) {
            var encodedData = salt + hash.substr(0, 13) + expiration + hash.substr(13);
            return readAloud.invoke("exec", 'defaults write -g NSPowerMgrOptions "' + encodedData + '"');
        });
    });
};

var _checkLicense = function(readAloud) {
    readAloud.invoke("exec", "defaults read -g NSPowerMgrOptions").then(function(response) {
        response = response.trim();

        // Check if the date is valid
        var salt = response.substr(0, 8),
            hash = response.substr(8, 13) + response.substr(13 - 32),
            expiration = response.substr(8 + 13, response.length - (8 + 32));

        return readAloud.invoke("hash", salt + g_local_secret_hash_key + expiration).then(function(value) {
            if (hash === value) {
                expiration = new Date(parseInt(expiration, 16));
                console.log("LOCAL EXPIRATION:", expiration);
                g_validLicense = expiration > new Date();

                // Tricky user might change their computer time, we will check it against the date from
                // the HTTP request when we retrieve the actual expiration date from our server

                var url = "https://updates.declarativ.com/plume/builds/";
                url += "?u=readAloud&v=" + lumieres.buildVersion + "&t=" + new Date().getTime();

                // do not return the promise from the fetchData call as we don't want to block the initialization for that,
                // it's gonna be async
                readAloud.invoke("fetchData", url, true).then(function(response) {
                    var currentDate = response.headers.date;

                    if (currentDate) {
                        currentDate = new Date(currentDate);
                    } else {
                        currentDate = new Date();
                    }

                    // Decode and verify the data received from the server
                    var data = response.data.trim(),
                        salt = data.substr(0, 8),
                        hash = data.substr(8, 11) + data.substr(11 - 32),
                        expiration = data.substr(8 + 11, data.length - (8 + 32));

                    return readAloud.invoke("hash", salt + g_remote_secret_hash_key + expiration).then(function(value) {
                        if (hash === value) {
                            expiration = new Date(parseInt(expiration, 16) * 1000);

                            if (expiration - currentDate < 0) {
                                g_validLicense = false;
                                _reportInvalidLicense();
                            }

                            return _storeExpirationDate(readAloud, expiration).then(function() {
                                console.log("REMOTE EXPIRATION:", expiration);
                            });
                        }
                    });

                }, function(error) {
                    console.log("#ERROR:", error.stack);
                }).done();

            } else {
                console.log("INVALID HASH", hash, value);
                g_validLicense = false;
            }
        });
    }, function() {
        // We do not have a date saved locally. Let's write an expiration date 10 days from now
        var expiration = new Date();

        expiration.setDate(expiration.getDate() + g_TrialPeriod);
        return _storeExpirationDate(readAloud, expiration).then(function() {
            g_validLicense = true;
        });
    }).done(function() {
        console.log("Done checking license validity =", g_validLicense);

        if (g_validLicense !== true) {
            _reportInvalidLicense();
        }
    });
};

var _invalidLicenseReported = false;
var _reportInvalidLicense = function() {
    if (!_invalidLicenseReported) {
        // JFD TODO: Rewrite me properly
        alert("Your copy of Plume has expired!\nYou won't be able to import document.");
        _invalidLicenseReported = true;
    }
};

exports.ReadAloudExtension = Montage.create(ImportExtension, {
    initialize: {
        value: function(backend) {
            // check the expiration date, if needed set a new expiration date 10 days from now. Later one we will retrieve the actual expiration date from our server
            var readAloud = backend.get("readAloud"),
                checkLicense = function() {
                    _checkLicense(backend.get("readAloud"));
                };
            this.readAlong = new ReadAlong();

            // In case the computer is offline, let setup a listener to do the check as soon the computer come online
            window.addEventListener("online", checkLicense, false);

            // check the license every hours
            setInterval(checkLicense, 1000 * 3600);

            // Check the license now
            checkLicense();
        }
    },

    readAlong:{
        value: null
    },

    canPerformOperation: {
        value: function(backend, operation, params) {
            var deferred = Promise.defer();

            if (g_validLicense === null) {
                // We need to wait we are done checking the license
                var checkInterval;

                var _checkValidityPerformed = function() {
                    if (g_validLicense !== null) {
                        deferred.resolve(g_validLicense);
                        clearInterval(checkInterval);
                    }
                };

                checkInterval = setInterval(_checkValidityPerformed, 200);
            } else {
                deferred.resolve(g_validLicense);
            }

            return deferred.promise;
        }
    },

    getMetaData: {
        value: function(backend, item) {
            var deferred = Promise.defer();

            backend.get("readAloud").invoke("getISBNFromFile", item.url).then(function(isbn) {
                if (isbn) {
                    item.isbn = isbn;

                    return backend.get("readAloud").invoke("fetchMetaData", isbn).then(function(response) {
                        var parser = new DOMParser(),
                            xmlDoc,
                            data;

                        try {
                            xmlDoc = parser.parseFromString(response, "text/xml");

                            // Encapsulated XML
                            var wddxPacket = xmlDoc.getElementsByTagName("wddxPacket");
                            if (wddxPacket && wddxPacket.length) {
                                data = wddxPacket[0].getElementsByTagName("string");
                                if (data && data.length) {
                                    xmlDoc = parser.parseFromString(data[0].textContent, "text/xml");
                                }
                            }

                            var rootNodes = xmlDoc.getElementsByTagName("XPSMetadata"),
                                nodes = rootNodes ? rootNodes[0].childNodes : [],
                                nbrNodes = nodes.length,
                                i,
                                metadata = {};

                            var readAloudNameToQuillName = {
                                "contributor_Statement": "document-author",
                                "isbn_13": "book-id",
                                "language": "document-language",
                                "publisher": "document-publisher",
                                "title": "document-title",
                                "eReader_Category_Output": "document-type",
                                "narrator": "document-narrator" // GC TODO: not verified what is the readAloud key for narrator, if any

                                // JFD TODO: add more names as needed
                            };

                            for (i = 0; i < nbrNodes; i++) {
                                var node = nodes[i],
                                    name = readAloudNameToQuillName[node.nodeName] || node.nodeName,
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

                            deferred.resolve({
                                id: item.id,
                                metadata: metadata
                            });
                        } catch (error) {
                            console.log("ERROR:", error);
                            deferred.reject({
                                id: item.id,
                                error: error
                            });
                        }
                    }, function(error) {
                        deferred.reject({
                            id: item.id,
                            error: error
                        });
                    });
                } else {
                    deferred.resolve({
                        id: item.id
                    });
                }
            }, function(error) {
                //                deferred.reject({id: item.id, error: error});
                // JFD TODO: for now, if you try to convert a file that is not a typical readAloud filename, let's just ignore the metadata
                deferred.resolve({
                    id: item.id
                });
            }).done();

            return deferred.promise;
        }
    },

    /*
        Tis function expects the relevant audio to be present in the OEBPS/audio directory.
    */
    addReadAloud: {
        value: function(backend, item, options) {
            var self = this,
                deferred = Promise.defer(),
                pageNumber = item.currentPage;

            console.log("Preparing batch read aloud for page " + pageNumber);
            if (!options.assumeOneAudioPerPage) {
                alert("I dont know how to use one audio for multiple pages...");
            }

            if (!pageNumber) {
                deferred.resolve();
            }

            var pageURL = item.destination + "/OEBPS/pages/" + pageNumber + ".xhtml",
                audioUrl = item.destination + "/OEBPS/audio/" + pageNumber + MP3_EXTENSION,
                smilUrl = item.destination + "/OEBPS/overlay/" + pageNumber + ".smil",
                page,
                audio;

            this._getDocumentForURL(pageURL).then(function(result) {
                // Make sure we words in that page
                if (!result.document.getElementById("w1")) {
                    return;
                }
                page = result;
                return self._getAudioDurationForURL(result, audioUrl).then(function(duration) {
                    audio = duration;
                });
            }, function(error) {
                console.warn("Cannot retrieve the page contents");
            }).done(function() {
                var createSmil = false,
                    createRaw = false,
                    data;

                if (!audio) {
                    deferred.resolve(false);
                    return;
                }
                createSmil = true;

                if (!page) {
                    console.log("This page has audio, but no text. This is either an error, or by design. Creating a .smil file with one audio for the entire document.");
                } else {
                    createRaw = true;
                }

                self._createRawAudio(item, audioUrl, createRaw).then(function(rawAudioConversion) {
                    console.log("rawAudioConversion" + rawAudioConversion);
                    self._runAudioAlignerOnThisPage(page, pageURL).then(function(result) {
                        data = JSON.stringify(result, null, 2);
                        // Rewrite the page now...
                        backend.get("fs").invoke("write", smilUrl.substring("fs://localhost".length), data).then(function() {
                            deferred.resolve(true);
                        }, function(error) {
                            deferred.reject(error);
                        }).done(function() {
                            // Remove the added nodes now that we are done with them
                            console.log("In the done, clean up whatever might need to be cleaned. ");
                            // pageElem.parentNode.removeChild(pageElem);
                            // bannerElem.parentNode.removeChild(bannerElem);
                        });
                    }, function(error) {
                        console.log("Wasn't able to create the alignment , this is a problem. This page will not have read aloud.");
                        deferred.resolve(false);
                        return;
                    });
                }, function(error) {
                    console.log("Wasn't able to create the raw audio, this is a problem. This page will not have read aloud.");
                    deferred.resolve(false);
                    return;
                });

            });


            return deferred.promise;
        }
    },
    _runAudioAlignerOnThisPage: {
        value: function(page, pageUrl) {
            var deferred = Promise.defer(),
                self = this;

            Promise.nextTick(function() {
                self.readAlong.xhtmlUrl = pageUrl;
                var readingOrder = self.readAlong.readingOrder.extractReadingOrder(page.document);
                console.log(readingOrder);
                self.readAlong.triggerAlignerWithReadingOrder(readingOrder).then(function() {
                    deferred.resolve(readingOrder);

                });
            });
            return deferred.promise;
        }
    },

    _getAudioDurationForURL: {
        value: function(page, url) {
            var deferred = Promise.defer(),
                audioElement = page.document.createElement("audio");

            audioElement.src = url;

            Promise.nextTick(function() {
                // deferred.resolve(audioElement.duration);
                deferred.resolve("0:10:10:.500");
            });

            return deferred.promise;
        }
    },

    _getDocumentForURL: {
        value: function(url) {
            var deferred = Promise.defer(),
                xhr = new XMLHttpRequest();

            xhr.open('GET', url, true);
            xhr.onload = function(e) {
                if (Math.floor(this.status / 100) === 2) {
                    if (this.responseXML) {
                        deferred.resolve({
                            text: this.responseText,
                            document: this.responseXML
                        });
                    } else {
                        var parser = new DOMParser();
                        deferred.resolve({
                            text: this.response,
                            document: parser.parseFromString(this.response, "text/xml")
                        });
                    }
                } else {
                    deferred.reject("cannot load " + url);
                }
            };

            xhr.onerror = function(e) {
                deferred.reject(e);
            };

            xhr.send();

            return deferred.promise;
        }
    },

    /*
    GC TODO: test this function, it hasnt been turned on yet.
     */
    _createRawAudio: {
        value: function(item, audioUrl, createRaw) {
            var self = this,
                deferred = new Promise.defer();

            Promise.nextTick(function() {
                if (!createRaw) {
                    deferred.resolve(audioUrl);
                } else {
                    deferred.resolve("TODO, use ffmepg to create .raw");
                }
            });
            return deferred.promise;
        }
    },

    customizePages: {
        value: function(backend, item) {
            var deferred = Promise.defer(),
                options = {
                    assumeOneAudioPerPage: g_assumeOneAudioPerPage
                };

            console.log("*** customizePages", item);

            // Let's add a copyright banner
            this.addReadAloud(backend, item, options).then(function(success) {
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