/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    PDF2HTML = require("core/pdf2html.js").PDF2HTML;


var IS_IN_LUMIERES = (typeof lumieres !== "undefined");


exports.Main = Montage.create(Component, {

    environmentBridge: {
        value: null
    },

    _processID: {
        value: undefined
    },

    processID: {
        get: function() {
            return this._processID;
        }
    },

    childProcessIDs: {
        value: []
    },

    url: {
        value: null
    },

    outputURL: {
        value: null
    },

    didCreate: {
        value: function () {
            var self = this;

foo = this;
console.log("PDF CONVERTER CREATED");

            if (IS_IN_LUMIERES) {

                this.params = [];
                window.location.search.substr(1).split("&").forEach(function(query) {
                    var param = query.split("=", 2);
                    self.params[param[0]] = param[1] !== undefined ? decodeURIComponent(param[1]) : null;
                });

                // add the path to the document title (for easy debugging)
                if (this.params.source) {
                    document.title = document.title + " - " + this.params.source.substr("fs://localhost".length);
                    this.url =  this.params.source;
                    this.outputURL = this.params.dest;
                }

                require.async("core/lumieres-bridge").then(function (exported) {
                    self.environmentBridge = exported.LumiereBridge.create();

                    self.environmentBridge.connectionHandler = self;
                    var backend = self.environmentBridge.backend; // force open backend connection

                    self.environmentBridge.userPreferences.then(function (prefs) {
                        return self.createOutputDirectory(prefs.importDestinationPath).then(function(outputURL) {
                            self.outputURL = outputURL;

                            console.log("OUTPUT DIRECTORY:", self.outputURL);
                            // Load the document
                            return PDF2HTML.getDocument(self.url, self.outputURL + "/OEBPS").then(function(pdf) {
                                self._document = pdf;
                                self.numberOfPages = pdf.pdfInfo.numPages;
                                self._pageNumber = self.params.p || 1;

                                return self.convertNextPage().then(function(success) {
                                    console.log("DONE!!!", success);
                                    return self.updateState("success").then(function() {
                                        // JFD TODO: we need a native call to force close the window as window.close() wont always work due to security issue
                                        window.close();
                                    });
                                });
                            });
                        }).fail(function(error) {
                            console.error("#ERROR:", error.message, error.stack);
                            // JFD TODO: handle error
                        }).done();

                    });
                })/*.done();*/
            } else {
                alert("Plume cannot be run outside of Lumieres!");
                return;
            }
        }
    },

    enterDocument: {
        value: function(firstTime) {
            if (firstTime) {
            }
        }
    },

    onConnect: {
        value: function() {
            var self = this;

            // Register the window with the IPC extension
            var ipc = this.environmentBridge.backend.get("ipc");

            ipc.invoke("register", "pdf-converter", this.processID, Promise.master(function() {
                return self.onIPCMessage.apply(self, arguments);
            })).then(function(processID){
                console.log("processID:", processID);
                self._processID = processID;

                // Let inform the app controller that we are here...
                ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                    console.log("--- update", processID)
                    if (processID) {
                        return ipc.invoke("send", self.processID, processID[0], ["converterInfo", {processID: self.processID, url: self.url}]);
                    }
                }).fail(function(e){
                        console.log("ERROR:", e.message, e.stack)
                }).done();
            }).done();
        }
    },
    onDisconnect: {
        value: function() {
            var self = this;

            // Let's reconnect...
            setTimeout(function() {
                var backend = self.environmentBridge.backend;
            }, 250);
        }
    },

    onIPCMessage: {
        value: function(from, to, data) {
            to = parseInt(to, 10);
            console.log("---onIPCMessage", from, to, data)

            if (to === this.processID) {
                if (data && data.length) {
                    if (data[0] === "close") {
                        setTimeout(window.close, 100);  // Give time to send response
                        return true;
                    }
                }
                throw new Error("Message refused, invalid data!");
            }
            throw new Error("Message refused, invalid sender!");
        }
    },

    updateState: {
        value: function(status) {
            var self = this,
                ipc = this.environmentBridge.backend.get("ipc"),
                deferred = Promise.defer();

            if (this._pendingStatus === status) {
                return;
            }

            this._pendingStatus = status;

            ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                if (processID) {
                    return ipc.invoke("send", self.processID, processID[0], ["itemUpdate", {
                        url: self.url,
                        status: status,
                        currentPage: self._pageNumber,
                        nbrPages: self.numberOfPages,
                        destination: self.outputURL
                    }]);
                }
            }).then(function(result) {
                self._pendingStatus = -1;
                promise.resolve(result);
            }, function(e) {
                self._pendingStatus = -1;
                promise.reject(e);
            });

            return deferred.promise;
        }
    },

    createOutputDirectory: {
        value: function(rootDirectory) {
            var self = this,
                outputPath = this.outputURL,
                forceCreate = false;

            if (!outputPath) {
                var fileName = this.url.substring(this.url.lastIndexOf("/") + 1),
                    extIndex = fileName.lastIndexOf(".");

                if (extIndex !== -1) {
                    fileName = fileName.substring(0, extIndex);
                }

                outputPath = rootDirectory + "/" + fileName + ".ebook";
                forceCreate = true;
            } else {
                outputPath = decodeURI(outputPath);
            }
console.log("--- createOutputDirectory", forceCreate, outputPath);
            return this.environmentBridge.backend.get("fs").invoke("exists", outputPath.substring("fs://localhost".length)).then(function(exists) {
                if (exists && !forceCreate) {
                    return outputPath;
                } else  {
                    return self.environmentBridge.backend.get("plume-backend").invoke("createFromTemplate", "pdf-converter/templates/epub3", outputPath).then(function(result) {
                        return result.url;
                    });
                }
            });
        }
    },

    convertNextPage: {
        value: function() {
            var self = this;

            self.updateState(null, self._pageNumber, self.numberOfPages);

            return PDF2HTML.getPage(this._document, this._pageNumber).then(function(page) {
                console.log("...page", self._pageNumber, "loaded")

                self._page = page;

//                thisRef.renderPage();

                var canvas = document.createElement("canvas"),
                    output = document.createElement("div");

                document.body.appendChild(output);


                return PDF2HTML.renderPage(page, 1.0, canvas, output).then(function() {
                    if (self._pageNumber < self.numberOfPages) {
                        self._pageNumber ++;
                        self.params.p = self._pageNumber;
                        self.params.dest = self.outputURL;

                        var newLoc = window.location.origin + window.location.pathname,
                            sep = "?";

                        for (param in self.params) {

                            newLoc += sep + param + "=" + encodeURIComponent(self.params[param]);
                            sep = "&";
                        }
                        window.location.href = newLoc;
                    }
                    return true;
                });
            });
        }
    }

});
