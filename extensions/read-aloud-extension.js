/*jshint camelcase:false, maxcomplexity:16 */ // TODO: fix these warnings
var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    Q = require("q"),
    ImportExtension = require("core/ImportExtension").ImportExtension,
    IMPORT_STATES = require("core/importStates").importStates,
    ReadAlong = require("core/read-along").ReadAlong;

var g_validLicense = null; // Null = need to check the license, true = licence ok, false = invalid license

var g_TrialPeriod = 10; //in days

var g_local_secret_hash_key = "e9161e517f3db0bed9ecf45f634f1f25";
var g_remote_secret_hash_key = "cdc1421b4468131ec9411b8522b1df61";

var g_assumeOneAudioPerPage = true;
var MP3_EXTENSION = ".mp3";
var WAV_EXTENSION = ".wav";
var RAW_EXTENSION = ".raw";

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
            var readAloudBackend = backend.get("readAloud"),
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

    readAlong: {
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
                pageNumber = options.pageIndex;

            console.log("Preparing batch read aloud for page " + pageNumber);
            if (!options.assumeOneAudioPerPage) {
                throw "I dont know how to use one audio for multiple pages...";
            }
            Promise.nextTick(function() {
                if (!pageNumber) {
                    deferred.resolve("missing page number");
                }

                var pageURL = item.destination + "/OEBPS/pages/" + pageNumber + ".xhtml",
                    audioUrl = item.destination + "/OEBPS/audio/" + pageNumber + WAV_EXTENSION,
                    voiceUrl = item.destination + "/OEBPS/voice/" + pageNumber + RAW_EXTENSION,
                    smilUrl = item.destination + "/OEBPS/overlay/" + pageNumber + ".smil",
                    jsonUrl = item.destination + "/json/" + pageNumber + ".json",
                    page,
                    audio,
                    ipc = backend.get("ipc");

                self._getDocumentForURL(pageURL).then(function(result) {
                    // Make sure we words in that page
                    if (!result.document.getElementById("w1")) {
                        return;
                    }
                    page = result;
                    return self._getAudioDurationForURL(backend, result, audioUrl, voiceUrl).then(function(duration) {
                        console.log("Page " + pageNumber + " has duration of " + duration);
                        audio = duration;
                    });
                }, function(error) {
                    console.warn("Cannot retrieve the page contents");
                }).done(function() {
                    var createSmil = false,
                        createRaw = false,
                        data;

                    if (!audio) {
                        //deferred.resolve(false);
                        deferred.resolve(pageNumber + " has no audio");
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
                        self._runAudioAlignerOnThisPage(page, pageURL).then(function(bestGuessedReadingOrder) {
                            data = JSON.stringify(bestGuessedReadingOrder, null, 2);
                            // Writing the json now...
                            backend.get("fs").invoke("write", jsonUrl.substring("fs://localhost".length), data).then(function() {
                                self.readAlong.convertToSMIL(bestGuessedReadingOrder).then(function(smilXML) {
                                    // Writing the smil now...
                                    backend.get("fs").invoke("write", smilUrl.substring("fs://localhost".length), smilXML).then(function() {

                                        //HACK to change the progress bar... otherwise it looks like it hangs
                                        item.currentPage = pageNumber + 1;
                                        item.status = IMPORT_STATES.generatingAudioAlignment;
                                        ipc.invoke("namedProcesses", "monitor").then(function(processID) {
                                            if (processID) {
                                                return ipc.invoke("send", item.processID, processID[0], ["itemUpdate", item]);
                                            }
                                        }).fail(function(e) {
                                            console.log("ERROR:", e.message, e.stack);
                                        }).done(function() {
                                            console.log("Done page " + pageNumber);
                                            deferred.resolve("created smil alignments");
                                        });

                                    }, function(error) {
                                        deferred.reject(error);
                                    }).done(function() {
                                        // Remove the added nodes now that we are done with them
                                        console.log("In the done, clean up whatever might need to be cleaned. ");
                                        // pageElem.parentNode.removeChild(pageElem);
                                        // bannerElem.parentNode.removeChild(bannerElem);
                                    });
                                });

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
                            deferred.resolve(error);
                            // deferred.resolve(true);
                            return;
                        });
                    }, function(error) {
                        console.log("Wasn't able to create the raw audio, this is a problem. This page will not have read aloud.");
                        deferred.resolve(error);
                        // deferred.resolve(true);
                        return;
                    });

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
        value: function(backend, page, sourceUrl, destUrl) {
            var self = this,
                deferred = Promise.defer(),
                audioElement = document.createElement("audio");

            //THis doesnt work. 
            audioElement.onload = function(something) {
                console.log(sourceUrl + " exists");
                // deferred.resolve(this.duration);
            };
            audioElement.onerror = function(error) {
                console.log(sourceUrl + " is missing. no audio.");
                // deferred.resolve(null);
            };

            Promise.nextTick(function() {
                // audioElement.src = sourceUrl;
                deferred.resolve("00:00:10.500");
                return;
                // backend.get("readAloud").invoke("getAudioDurationAndCreateRawAudio",
                //     sourceUrl, destUrl, null, null).then(function(duration) {
                //     deferred.resolve(duration);
                // });

                // self.readAlong.getAudioDuration().then(function(duration) {
                //     deferred.resolve(duration);
                // });

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
                },
                promises = [];

            console.log("*** customizePages", item);

            for (var pageIndex = 1; pageIndex <= item.nbrPages; pageIndex++) {
                options.pageIndex = pageIndex;
                promises.push(this.addReadAloud(backend, item, options));
            }

            Q.allSettled(promises).then(function(success) {
                console.log("all promises in customizePages then ", success);
                deferred.resolve(item.id);
            }).fail(function(error) {
                console.log("failed with customizePages ", error);
                deferred.reject(error);
            }).done(function(e) {
                console.log("done with customizePages ", e);
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