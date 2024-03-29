/* global lumieres */
var Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    RangeController = require("montage/core/range-controller").RangeController,
    adaptConnection = require("q-connection/adapt"),
    Connection = require("q-connection"),
    PageDocument = require("core/page-document").PageDocument;

exports.Main = Component.specialize({

    params: {
        value: {
        }
    },

    _url: {
        value: null
    },

    url: {
        get: function() {
            return this._url;
        },

        set: function(url) {
            var pos = url.lastIndexOf("/");

            this._url = url;
            window.document.title = decodeURI(pos !== -1 ? url.substr(pos + 1) : url);
        }
    },

    spreadView: {
        value: null
    },

    pages: {
        value: null
    },

    currentPageIndex: {
        value: null
    },

    _currentPage: {
        value: null
    },

    currentPage: {
        get: function() {
            return this._currentPage;
        },

        set: function(value) {
            var index = -1;

            this._currentPage = value;

            if (this.pages) {
                index = this.pages.indexOf(value);
            }

            this.currentPageIndex = index;
        }
    },

    contentController: {
        value: null
    },

    _processID: {
        value: null
    },

    processID: {
        get: function() {
            return this._processID;
        }
    },

    _backend: {
        value: null
    },

    backend: {
        get: function () {
            var self = this,
                resolvePort = function () {
                    if (lumieres.nodePort) {
                        port.resolve(lumieres.nodePort);
                    }
                };

            if (self._backend == null) {
                var port = Promise.defer();
                if (lumieres.nodePort) {
                    port.resolve(lumieres.nodePort);
                } else {
                    while (port.promise.isPending()) {
                        port.promise.delay(20).then(resolvePort);
                    }
                }
                var connection = adaptConnection(new WebSocket("ws://localhost:" + lumieres.nodePort));
                connection.closed.then(function() {
                    self._backend = null;
                    // auto reconnect...
                    setTimeout(function() {
                        // force the backend getter to be called again
                        //jshint -W030
                        self.backend;
                        //jshint +W030
                    }, 250);
                });
                self._backend = Connection(connection);

                // Re-register the process with the IPC
                if (self._processID) {
                    self.backend.get("ipc").invoke("register", self._processID, Promise.master(function() {
                        return self.onIPCMessage.apply(self, arguments);
                    })).then(function(processID){
                        self._processID = processID;
                        console.log("reconnected to ipc with id:", processID);
                    });
                }
            }

            return self._backend;
        }
    },

    constructor: {
        value: function Main() {
            this.contentController = RangeController.create().initWithContent([]);
            this.contentController.avoidsEmptySelection = true;
            this.contentController.multiSelect = false;
        }
    },

    templateDidLoad: {
        value: function() {
            var self = this;

            console.log("templateDidLoad");

            var searches = document.location.search.substr(1).split("&");
            searches.forEach(function (search) {
                var param = search.split("=");
                self.params[decodeURIComponent(param[0])] = param.length > 1 ? decodeURIComponent(param[1]) : null;
            });

            console.log(this.params);

            if (this.params.file && this.params.file.slice(-6) === ".ebook") {
                this.url = encodeURI(this.params.file);
                this.loadContentInfo();

                // Resolve the URL of the original PDF
                var originalPath = this.params.file.substr("fs://localhost".length) + "/original.pdf";
                this.backend.get("fs").invoke("canonical", originalPath).then(function(path) {
                    self.spreadView.overlayUrl = encodeURI("fs://localhost" + path);
                }).done();
            }

            // Register the window for IPC
            this.backend.get("ipc").invoke("register", 0, Promise.master(function() {
                return self.onIPCMessage.apply(self, arguments);
            })).then(function(processID){
                console.log("processID:", processID);
                self._processID = processID;
            });
        }
    },

    onIPCMessage: {
        value: function(from, to, data) {
            if (to === this.processID) {
                console.log("RECEIVED AN IPC MESSAGE FROM", from + ":", data);
                return "thank you very much";
            }

            throw new Error("Message refused!");
        }
    },

    enterDocument: {
        value: function(firstTime) {
            if (firstTime) {
                window.addEventListener("resize", this);
            }
        }
    },

    handleLoadedPage: {
        value: function (evt) {
            var detail = evt.detail,
                pageDocument = detail.page;

            pageDocument.pageWindow = detail.pageWindow;
        }
    },

    loadContentInfo: {
        value: function() {
            var self = this,
                xhr = new XMLHttpRequest();

            this.pages = [];

            xhr.open('GET', self.url + '/OEBPS/content.opf', true);

            xhr.onload = function(e) {
                if (this.status === 200) {
                    var spines,
                        contentInfo = this.responseXML,
                        pageDocument,
                        pages = [],
                        contentWidth = 0,
                        contentHeight = 0;

                    pageDocument = new PageDocument();
                    pageDocument.name = "cover";
                    pageDocument.type = "image";
                    pageDocument.url = null;
                    pages.push(pageDocument);

                    // Get the document resolution
                    var resolution = contentInfo.getElementsByName("original-resolution");
                    if (resolution && resolution.length) {
                        resolution = resolution[0].getAttribute("content");
                        if (typeof resolution === "string") {
                            resolution = resolution.split("x");
                            if (resolution.length === 2) {
                                contentWidth = parseInt(resolution[0], 10);
                                contentHeight = parseInt(resolution[1], 10);
                            }
                        }
                    }

                    // Get the URL of te cover page
                    var cover = contentInfo.getElementById("cover");
                    if (cover) {
                        pages[0].url = self.url + "/OEBPS/" + cover.getAttribute("href");
                    }
                    pages[0].width = contentWidth;
                    pages[0].height = contentHeight;

                    // Get the list of pages
                    spines = contentInfo.getElementsByTagName("spine");
                    if (spines && spines.length) {
                        var nodes = spines[0].children;

                        if (nodes) {
                            var nbrNodes = nodes.length,
                                i;

                            for (i = 0; i < nbrNodes; i ++) {
                                var node = nodes[i];

                                var id = node.getAttribute("idref");
                                if (id) {
                                    var page = contentInfo.getElementById(id);
                                    pageDocument = new PageDocument();
                                    pageDocument.name = (i + 1);
                                    pageDocument.type = "page";
                                    pageDocument.width = contentWidth;
                                    pageDocument.height = contentHeight;
                                    pageDocument.url = self.url + "/OEBPS/" + page.getAttribute("href");

                                    pages.push(pageDocument);
                                }
                            }

                            self.pages = pages;
                            self.contentController.content = pages;
                        }
                    }

                } else {
                    console.log("BOGUS XHR STATUS", this.status);
                }
            };

            xhr.send();
        }
    },

    handleResize: {
        value: function (event) {
            if (this.spreadView) {
                this.spreadView.needsDraw = true;
            }
        }
    },

    handleSaveButtonAction: {
        value: function () {
            //TODO this isn't exactly how I would expect this to work, this is just enough to exercise
            // some of the next steps toward saving
            if (this.currentPage) {
                var pageToSave = this.currentPage,
                    self = this;

                pageToSave.getDocument().then(function (doc) {
                    var content = (new XMLSerializer()).serializeToString(doc);

                    //TODO actually use an environment bridge
                    var pathMatch = pageToSave.url.match(/fs:\/\/localhost(.*)\?/);

                    if (pathMatch || !pathMatch[1]) {
                        var path = pathMatch[1];
                        var flags = {flags: "w", charset: 'utf-8'};
                        console.log("Saving to ", path);
                        return self.backend.get("fs").invoke("write", path, content, flags);
                    } else {
                        throw new Error("Could not find path to save" + pageToSave.url);
                    }
                }).done();
            }
        }
    },

    handleViewmodeButtonAction: {
        value: function(event) {
            if (event.target.pressed) {
                this.spreadView.viewMode = "single"
            } else {
                this.spreadView.viewMode = "default"
            }
        }
    }

});
