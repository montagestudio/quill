var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    AdaptConnection = require("q-connection/adapt"),
    Connection = require("q-connection");

var IS_IN_LUMIERES = (typeof lumieres !== "undefined");


exports.AudioAlignment = Montage.specialize({

    _backend: {
        value: null
    },

    pagesDir: {
        value: "pages"
    },

    audioDir: {
        value: "audio"
    },

    backend: {
        get: function() {
            var self = this;

            if (self._backend == null) {
                var connection = AdaptConnection(new WebSocket("ws://localhost:" + lumieres.nodePort));
                connection.closed.then(function() {
                    self._backend = null;
                });

                self._backend = Connection(connection);
            }

            return self._backend;
        }
    },

    initialize: {
        value: function(path, pageNumber) {
            var self = this,
                deferred = Promise.defer();

            Promise.nextTick(function() {

                if (IS_IN_LUMIERES) {
                    //                console.log(">>> SETUP CACHE FOR", decodeURIComponent(path.substring("fs://localhost".length)), pdf.pdfInfo.fingerprint);


                    if (path.indexOf("fs://localhost") === 0) {
                        // var aligner = self.backend.get("aligner");
                        // // var aligner = new AudioTextAligner();

                        // // aligner.run().then(function(result) {

                        // //     console.log("Recieved result: ", result);
                        // //     for (var run = 0; run < aligner.runs.length; run++) {
                        // //         console.log("First guess: ", aligner.runs[run].guesses[1]);
                        // //         console.log("Performance: ", aligner.runs[run].performance);
                        // //     }

                        // // }, function(reason) {

                        // //     console.log("Failed to get result.", reason);

                        // // });

                        // aligner.invoke("run", self.folderPath).then(function(result) {
                        //     console.log("Recieved alignment result: ", result);
                        //     // for (var run = 0; run < aligner.runs.length; run++) {
                        //     //     console.log("First guess: ", aligner.runs[run].guesses[1]);
                        //     //     console.log("Performance: ", aligner.runs[run].performance);
                        //     // }

                        // }, function(reason) {

                        //     console.log("Failed to get alignment result.", reason);

                        // })
                        this.folderPath = decodeURIComponent(path.substring("fs://localhost".length));
                        if (this.folderPath.charAt(this.folderPath.length - 1) !== "/") {
                            this.folderPath += "/";
                        }

                        deferred.resolve(self);

                    } else {
                        deferred.reject("Cannot initialize the AudioAligner Object: invalid document path!");
                    }
                } else {
                    deferred.reject("The AudioAligner object can only be set when running under Lumieres!");
                }
            });
            return deferred.promise;
        }
    },

    close: {
        value: function() {
            this._backend.close();
        }
    },

    _readingOrderJson: {
        value: null
    },

    readingOrderJson: {
        get: function() {
            // console.log("get readingOrderJson in aligner", this._readingOrderJson);

            return this._readingOrderJson;
        },
        set: function(value) {
            // console.log("set readingOrderJson in aligner", value);

            if (value && value !== this._readingOrderJson) {
                this._readingOrderJson = value;
                console.log("TODO decide if we shoudl re-trigger the aligner");
            }
        }
    },

    runAligner: {
        value: function(options) {
            var deferred = Promise.defer(),
                self = this;

            Promise.nextTick(function() {
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

                // if (parseInt(options.pageNumber, 10) % 2 === 1) {
                //     console.log("Only running the right page. ");
                //     options.alignmentResults = [{
                //         "guesses": {},
                //         "info": "waiting on the other page to finish."
                //     }];
                //     deferred.resolve(options);
                //     return;
                // }
                console.log("Running the voice audio " + options.voice);

                self.backend.get("aligner").invoke("run", options.voice, options.text).then(function(result) {
                    // console.log("Alignment is complete: ", result);
                    options.alignmentResults = result;
                    // for (var run = 0; run < aligner.runs.length; run++) {
                    // console.log("First guess: ", result.guesses[1]);
                    // console.log("Performance: ", result.performance);
                    // }
                    deferred.resolve(options);
                    // 
                    // 
                    // self.backend.get("aligner").invoke("getRuns").then(function(runs) {
                    //     console.log("Recieved alignment result: ", runs);
                    //     // for (var run = 0; run < runs.length; run++) {
                    //     //     console.log("First guess: ", runs[run].guesses[1]);
                    //     //     // console.log("Performance: ", runs[run].performance);
                    //     // }
                    //     deferred.resolve(runs);
                    // }, function(reason) {
                    //     console.log("Failed to get alignment result.", reason);
                    //     deferred.reject(reason);
                    // });

                }, function(reason) {
                    console.log("Failed to get alignment result.", reason);
                    deferred.reject(reason);
                });



            });
            return deferred.promise;
        }
    }
});