/*jshint maxcomplexity:12 */ // TODO: fix these warnings
/* global lumieres, PDFJS */
var Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    PDF2HTML = require("core/pdf2html.js").PDF2HTML,
    PDF2HTMLCache = require("core/pdf2html-cache.js").PDF2HTMLCache,
    IMPORT_STATES = require("core/importStates").importStates;

var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

exports.Main = Component.specialize({

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

    maxResolution: {
//        value: 2048
        value: 1024
    },

    scale: {
        value: 1.0
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

    _converter: {
        value: null
    },

    constructor: {
        value: function PDFConverter() {
            var self = this;

            this.super();

            if (IS_IN_LUMIERES) {
                this._converter = PDF2HTML.create();
                this._converter.bypassPFDJSRendering = true;

//                this._converter.renderingMode = PDF2HTML.RENDERING_MODE.hybrid;
                this._converter.renderingMode = PDF2HTML.RENDERING_MODE.svg;

                this.params = [];
                window.location.search.substr(1).split("&").forEach(function(query) {
                    var param = query.split("=", 2);
                    self.params[param[0]] = param[1] !== undefined ? decodeURIComponent(param[1]) : null;
                });

                if (this.params.id) {
                    this.id = parseInt(this.params.id, 10);
//                    this.outputURL = this.params.dest;
                } else {
                    console.error("you must specify an item's id!");
                    return;
                }

                require.async("adaptor/client/core/lumieres-bridge").then(function (exported) {
                    self.environmentBridge = new exported.LumiereBridge().init("plume-backend");

                    self.environmentBridge.connectionHandler = self;
                    var backend = self.environmentBridge.backend, // force open backend connection,
                        ipc = backend.get("ipc");

                    ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                        if (processID) {
                            return ipc.invoke("send", self.processID, processID[0], ["getItem", self.id]).then(function(item) {
                                if (item && typeof item === "object") {
                                     // add the path to the document title (for easy debugging)
                                    document.title = document.title + " - " + item.url.substr("fs://localhost".length);

                                    self.url = item.url;
                                    self.outputURL = item.destination || null;
                                    self.metadata = item.metadata;
                                }
                            }, function(error) {
                                console.log("ERROR", error.message);
                            });
                        }
                    }).done(function() {
                        if (self.url === null) {
                            // Invalid item, let's close the window
                            lumieres.document.close(true);
                            return;
                        }

                        self.environmentBridge.userPreferences.then(function (prefs) {
                            return self.createOutputDirectory(prefs.importDestinationPath).then(function(outputURL) {
                                self.outputURL = outputURL;

                                // Load the document
                                return self._converter.getDocument(self.url, self.outputURL + "/OEBPS/pages").then(function(pdf) {
                                    self._document = pdf;
                                    self.numberOfPages = pdf.pdfInfo.numPages;
//self.numberOfPages = 3;
//if (!self.params.p)
//self.params.p = 2;

                                    self._pageNumber = parseInt(self.params.p, 10) || 1;

                                    var pad = function(number) {
                                        return ("00" + number).substr(-2);
                                    };

                                    var now = new Date(),
                                        options = {
                                        "fixed-layout": "true",
                                        "original-resolution": "500x800",       // JFD TODO: we need a real value!!!
                                        "document-title": self.metadata ? self.metadata["document-title"] : null || "Untitled",
                                        "document-author": self.metadata ? self.metadata["document-author"] : null || "Unknown",
                                        "document-description": self.metadata ? self.metadata["document-description"] : null || "",
                                        "document-publisher": self.metadata ? self.metadata["document-publisher"] : null || "Unknown",
                                        "document-type": self.metadata ? self.metadata["document-type"] : null || "Unknown",
                                        "document-date": now.getUTCFullYear() + "-" + (now.getUTCMonth() + 1) + "-" + (now.getUTCDate() + 1),
                                        "document-language": "en-us",
                                        "book-id": "0",
                                        "modification-date": now.getUTCFullYear() + "-" + pad(now.getUTCMonth() + 1) +
                                            "-" + pad(now.getUTCDate() + 1) +
                                            "T" + pad(now.getUTCHours()) + ":" + pad(now.getUTCMinutes()) + ":" + pad(now.getUTCSeconds()) + "Z"
                                    };

                                    return PDF2HTMLCache.create().initialize(self.outputURL + "/OEBPS/assets/", pdf).then(function(cache) {
                                        PDFJS.objectsCache = cache;
                                        PDFJS.jpegQuality = 1.0;

                                        return self.convertNextPage().then(function(success) {
                                            var view = self._page.pageInfo.view,
                                                title = self.url.substr(self.url.lastIndexOf("/") + 1),
                                                pos;

                                            if (success) {
                                                title = title.substr(0, title.toLowerCase().indexOf(".pdf"));
                                                pos = title.indexOf("_");
                                                if (pos > 0) {
                                                    title = title.substr(0, title.indexOf("_"));
                                                }

                                                options["original-resolution"] = Math.round((view[2] - view[0]) * self.scale) + "x" +
                                                    Math.round((view[3] - view[1]) * self.scale);

                                                options["book-id"] = options["book-id"] || self._document.pdfInfo.fingerprint;
                                                options["document-title"] = options["document-title"] || title;

                                                // Time to get the table of content
                                                return self._converter.getOutline(self._document).then(function(toc) {
                                                    options.toc = toc;
                                                    return self.sendMessage("importDone", {
                                                        id: self.id,
                                                        destination: self.outputURL,
                                                        meta: options
                                                    }).then(function() {
                                                        lumieres.document.close(true);
                                                    });
                                                });
                                            }
                                        });
                                    });
                                });
                            }).fail(function(error) {
                                console.error("#ERROR:", error.message, error.stack);
                                // JFD TODO: handle error
                            }).done();
                        });
                    });
                });/*.done();*/
            } else {
                console.error("Plume cannot be run outside of Lumieres!");
                return;
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
                    console.log("--- update", processID);
                    if (processID) {
                        return ipc.invoke("send", self.processID, processID[0], ["converterInfo", {processID: self.processID, id: self.id}]);
                    }
                }).fail(function(e) {
                    console.log("ERROR:", e.message, e.stack);
                }).done();
            }).done();
        }
    },
    onDisconnect: {
        value: function() {
            var self = this;

            // Let's reconnect...
            setTimeout(function() {
                //jshint -W030
                self.environmentBridge.backend;
                //jshint +W030
            }, 250);
        }
    },

    onIPCMessage: {
        value: function(from, to, data) {
            to = parseInt(to, 10);
            console.log("---onIPCMessage", from, to, data);

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

    sendMessage: {
        value: function(message, data) {
            var self = this,
                ipc = this.environmentBridge.backend.get("ipc");

            return ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                if (processID) {
                    return ipc.invoke("send", self.processID, processID[0], [message, data]);
                }
            });
        }
    },

    updateState: {
        value: function(status, meta) {
            var self = this,
                deferred = Promise.defer();

            this.environmentBridge.backend.get("ipc");

            if (this._pendingStatus === status) {
                deferred.resolve();
                return deferred.promise;
            }

            this._pendingStatus = status;

            this.sendMessage("itemUpdate", {
                id: self.id,
                status: status,
                currentPage: self._pageNumber,
                nbrPages: self.numberOfPages,
                destination: self.outputURL,
                meta: meta
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

            lumieres.powerManager.preventIdleSleep("Importing PDF");    // We don't want to system to go to sleep while importing

            self.updateState(IMPORT_STATES.converting, self._pageNumber, self.numberOfPages);

            console.log("convert", this._pageNumber);
            return self._converter.getPage(this._document, this._pageNumber).then(function(page) {
                console.log("...page", self._pageNumber, "loaded");

                self._page = page;

                var canvas = document.createElement("canvas"),
                    output = document.createElement("div");

                document.body.appendChild(output);

                // Calculate the optimum scale to fit the maxResolution
                var viewPort = page.getViewport(1);
                self.scale = self.maxResolution / Math.min(viewPort.width, viewPort.height);

                return self._converter.renderPage(page, canvas, output, self.scale, true).then(function(output) {
                    var viewport = page.getViewport(self.scale),
                        folderPath = decodeURIComponent((self.outputURL).substring("fs://localhost".length));

                    return self.environmentBridge.backend.get("plume-backend").invoke("appendImagesInfo", folderPath, self._document.imagesInfo).then(function() {
                        return self.environmentBridge.backend.get("plume-backend").invoke("createFromTemplate",
                            "/pdf-converter/templates/page.xhtml",
                            folderPath + "/OEBPS/pages/" + (page.pageInfo.pageIndex + 1) + ".xhtml",
                            {
                                "page-width": Math.round(viewport.width),
                                "page-height": Math.round(viewport.height),
                                "page-title": "page " + (page.pageInfo.pageIndex + 1),
                                "page-headers": "",
                                "page-style": output.style,
                                "page-content": output.data
                            },
                            true).then(function() {
                                if (self._pageNumber < self.numberOfPages) {
                                    self._pageNumber ++;
                                    self.params.p = self._pageNumber;

                                    var newLoc = window.location.origin + window.location.pathname,
                                        sep = "?",
                                        params = Object.keys(self.params);

                                    params.forEach(function(param) {
                                        newLoc += sep + param + "=" + encodeURIComponent(self.params[param]);
                                        sep = "&";
                                    });
                                    lumieres.powerManager.allowIdleSleep();
                                    window.location.href = newLoc;
                                    return false;
                                }

                                lumieres.powerManager.allowIdleSleep();
                                return true;
                            });
                    });
                });
            });
        }
    }

});
