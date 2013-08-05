/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    PDF2HTML = require("core/pdf2html.js").PDF2HTML,
    PDF2HTMLCache = require("core/pdf2html-cache.js").PDF2HTMLCache;

var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

// Constants (must match STATUS in application-controller/ui/main.reel/main.js)
var STATUS_WAITING = 0,
    STATUS_IMPORTING = 1,
    STATUS_STALLED = 2,
    STATUS_READY = 10;

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

    scale: {
        value: 2.0
    },


    url: {
        value: null
    },

    id: {
        value: null
    },

    outputURL: {
        value: null
    },

    didCreate: {
        value: function () {
            var self = this;

            if (IS_IN_LUMIERES) {
                PDF2HTML.renderingMode = PDF2HTML.RENDERING_MODE.svg;

                this.params = [];
                window.location.search.substr(1).split("&").forEach(function(query) {
                    var param = query.split("=", 2);
                    self.params[param[0]] = param[1] !== undefined ? decodeURIComponent(param[1]) : null;
                });

                // add the path to the document title (for easy debugging)
                if (this.params.source) {
                    document.title = document.title + " - " + this.params.source.substr("fs://localhost".length);
                    this.id =  parseInt(this.params.id, 10);
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
//self.numberOfPages = 60;
                                self._pageNumber = self.params.p || 1;

                                var pad = function(number) {
                                    return ("00" + number).substr(-2);
                                }

                                var now = new Date(),
                                    options = {
                                    "fixed-layout": "true",
                                    "original-resolution": "500x800",       // JFD TODO: we need a real value!!!
                                    "document-title": "Untitled",
                                    "document-author": "Unknown",
                                    "document-description": "This eBook has been generated by Plume",
                                    "document-publisher": "Unknown",
                                    "document-date": now.getUTCFullYear() + "-" + (now.getUTCMonth() + 1) + "-" + (now.getUTCDate() + 1),
                                    "document-language": "en-us",
                                    "book-id": "0",
                                    "modification-date": now.getUTCFullYear() + "-" + pad(now.getUTCMonth() + 1) +
                                        "-" + pad(now.getUTCDate() + 1) +
                                        "T" + pad(now.getUTCHours()) + ":" + pad(now.getUTCMinutes()) + ":" + pad(now.getUTCSeconds()) + "Z"
                                }

                                return Montage.create(PDF2HTMLCache).initialize(self.outputURL + "/OEBPS/assets/", pdf).then(function(cache) {
                                        PDFJS.objectsCache = cache;

                                    return self.convertNextPage().then(function(success) {
                                        var view = self._page.pageInfo.view,
                                            title = self.url.substr(self.url.lastIndexOf("/") + 1),
                                            pos;

                                        title = title.substr(0, title.toLowerCase().indexOf(".pdf"));
                                        pos = title.indexOf("_");
                                        if (pos > 0) {
                                            title = title.substr(0, title.indexOf("_"));
                                        }

                                        options["original-resolution"] = Math.round((view[2] - view[0]) * self.scale) + "x" +
                                            Math.round((view[3] - view[1]) * self.scale);
                                        options["book-id"] = self._document.pdfInfo.fingerprint;
                                        options["document-title"] = title;

                                        return self.updateState("success", options).then(function() {
                                            console.log("DONE!!!", success);
                                            lumieres.document.close(true);
                                        });
                                    });
                                    }
                                );
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
                        return ipc.invoke("send", self.processID, processID[0], ["converterInfo", {processID: self.processID, id: self.id}]);
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
        value: function(status, meta) {
            var self = this,
                ipc = this.environmentBridge.backend.get("ipc"),
                deferred = Promise.defer();

            if (this._pendingStatus === status) {
                deferred.resolve();
                return deferred.promise;
            }

            this._pendingStatus = status;

            ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                if (processID) {
                    return ipc.invoke("send", self.processID, processID[0], ["itemUpdate", {
                        id: self.id,
                        status: status,
                        currentPage: self._pageNumber,
                        nbrPages: self.numberOfPages,
                        destination: self.outputURL,
                        meta: meta
                    }]);
                }
            }).then(function(result) {
                self._pendingStatus = -1;
                deferred.resolve(result);
            }, function(e) {
                self._pendingStatus = -1;
                deferred.reject(e);
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

            self.updateState(STATUS_IMPORTING, self._pageNumber, self.numberOfPages);

            return PDF2HTML.getPage(this._document, this._pageNumber).then(function(page) {
                console.log("...page", self._pageNumber, "loaded")

                self._page = page;

                var canvas = document.createElement("canvas"),
                    output = document.createElement("div");

                document.body.appendChild(output);

                return PDF2HTML.renderPage(page, canvas, output, self.scale, true).then(function(output) {
                    // JFD TODO: write the output to disk
                    var viewport = page.getViewport(self.scale),
                        folderPath = decodeURIComponent((self.outputURL + "/OEBPS/pages/").substring("fs://localhost".length));

                    console.log(output, folderPath);
                    return self.environmentBridge.backend.get("plume-backend").invoke("createFromTemplate",
                        "/pdf-converter/templates/page.xhtml",
                        folderPath + (page.pageInfo.pageIndex + 1) + ".xhtml",
                        {
                            "page-width": Math.round(viewport.width),
                            "page-height": Math.round(viewport.height),
                            "page-title": "page " + (page.pageInfo.pageIndex + 1),
                            "page-headers": "",
                            "page-style": output.style,
                            "page-content": output.data
                        },
                        true
                    ).then(function() {
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
            });
        }
    }

});
