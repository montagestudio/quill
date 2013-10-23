/*jshint camelcase:false, maxcomplexity:18, forin:false, loopfunc:true */ // TODO: fix these warnings
/*global lumieres,alert */
var Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,

    defaultEventManager = require("montage/core/event/event-manager").defaultEventManager,
    ImportExtension = require("core/ImportExtension").ImportExtension,
    IMPORT_STATES = require("core/importStates").importStates;


var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

// Constants
var MAX_CHILDPROCESS = 2,
    MAX_CONCURENT_FETCHES = 2;

var CHECK_INTERVAL  = 10,
    STALL_TIMEOUT = 30,
    RESTART_TIMEOUT = 60;


exports.Main = Component.specialize({

    extension: {
        value: null
    },

    environmentBridge: {
        value: null
    },

    _processID: {
        value: void 0
    },

    processID: {
        get: function() {
            return this._processID;
        }
    },

    importItems: {
        value: []
    },

    importDestinationPath: {
        value: null
    },

    constructor: {
        value: function applicationController() {
            // Make stack traces from promise errors easily available in the
            // console. Otherwise you need to manually inspect the error.stack
            // in the debugger.
            Promise.onerror = function (error) {
                if (error.stack) {
                    console.groupCollapsed("%c Uncaught promise rejection: " + (error.message || error), "color: #F00; font-weight: normal");
                    console.log(error.stack);
                    console.groupEnd();
                } else {
                    throw error;
                }
            };

            this.super();

            if (IS_IN_LUMIERES) {
                var self = this;

                require.async("adaptor/client/core/lumieres-bridge").then(function (exported) {
                    self.environmentBridge = new exported.LumiereBridge().init("plume-backend");

                    self.environmentBridge.connectionHandler = self;
                    //jshint -W030
                    self.environmentBridge.backend; // force open backend connection
                    //jshint +W030

                    // JFD TODO: we need a dynamic way to figure out which extension we want to load, for know we will default to Scholastic
                    return require.async("extensions/scholastic-extension.js").then(function(exported) {
                        self.extension = exported.ScholasticExtension.create();

                        return self.environmentBridge.userPreferences.then(function (prefs) {
                            if (typeof prefs.importDestinationPath !== "string" || !prefs.importDestinationPath.length) {
                                self.environmentBridge.backend.get("application").invoke("specialFolderURL", "documents", "user").then(function(path) {
                                    self.importDestinationPath = path.url + "/" + lumieres.applicationName;
                                    lumieres.setUserPreferences({importDestinationPath: self.importDestinationPath}, function (error, result) {
                                        if (error) {
                                            console.warm("Cannot set preferences");
                                        }
                                    });
                                });
                            } else {
                                self.importDestinationPath = prefs.importDestinationPath;
                            }
                        });
                    });
                }).done(function() {
                    if (self.extension === null) {
                        self.extension = ImportExtension.create();
                    }

                    self.needsDraw = true;

                    window.setInterval(function() {
                        self.checkImporters();
                    }, CHECK_INTERVAL * 1000);

                    console.log("--- application-controller running ---");
                });
            } else {
                alert("Plume cannot be run outside of Lumieres!");
                return;
            }
        }
    },

    enterDocument: {
        value: function(firstTime) {
            if (firstTime) {
//                console.log("MENU:", defaultMenu.menuItemForIdentifier("importDocument"));
                defaultEventManager.application.addEventListener("menuAction", this);
            }
        }
    },

    onConnect: {
        value: function() {
            var self = this;

            // Register the window with the IPC extension
            this.environmentBridge.backend.get("ipc").invoke("register", "app-controller", this.processID, Promise.master(function() {
                return self.onIPCMessage.apply(self, arguments);
            }), true).then(function(processID){
                self._processID = processID;
                console.log("--- app-controller process id:", processID);
            }, function(e) {
                console.log("ERROR:", e.message, e.stack);
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
            var self = this;

            to = parseInt(to, 10);

            if (to === this.processID) {
                if (data && data.length) {
                    var command = data[0],
                        items,
                        item,
                        length,
                        id,
                        i;

                    if (command === "getImportItems") {
                        return this.importItems;
                    }

                    else if (command === "getItem") {
                        items = this.importItems;
                        length = items.length;
                        id = parseInt(data[1], 10);

                        for (i = 0; i < length; i ++) {
                            if (items[i].id === id) {
                                return items[i];
                            }
                        }
                        return null;
                    }

                    else if (command === "removeItem") {
                        items = this.importItems;
                        length = items.length;
                        id = parseInt(data[1].id, 10);

                        for (i = 0; i < length; i ++) {
                            if (items[i].id === id) {
                                if (items[i].processID) {
                                   // Stop the import before removing the item from the list...
                                    this.environmentBridge.backend.get("ipc")
                                    .invoke("send", self.processID, items[i].processID, ["close"])
                                    .done();
                                }

                                items.splice(i, 1);
                                this.upgradeItemsState();
                                return true;
                            }
                        }
                        return false;
                    }

                    else if (command === "converterInfo") {
                        item = this._importItemForID(data[1].id);
                        if (item) {
                            item.processID = data[1].processID;
                            item.lastContact = new Date().getTime() / 1000;
                            return true;
                        }
                        return false;
                    }

                    else if (command === "itemUpdate") {
                        item = this._importItemForID(data[1].id);
                        if (item) {
                            self.updateItemState(item, data[1].status, data[1].currentPage, data[1].nbrPages, data[1].destination, data[1].meta);
                            item.lastContact = new Date().getTime() / 1000;
                            return true;
                        }
                        return false;
                    }

                    else if (command === "importDone") {
                        item = this._importItemForID(data[1].id);
                        if (item) {
                            item.meta = data[1].meta;

                            this.extension.customizePages(self.environmentBridge.backend, item).then(function() {
                                item.lastContact = new Date().getTime() / 1000;
                                return self.optimize(item).then(function() {
                                    item.lastContact = new Date().getTime() / 1000;
                                    return self.extension.customizeAssets(self.environmentBridge.backend, item).then(function() {
                                        item.lastContact = new Date().getTime() / 1000;
                                        self.buildTableOfContent(item.meta);
                                        return self.extension.customizeEbook(self.environmentBridge.backend, item).then(function() {
                                            return self.generateEpub(item).then(function() {
                                                item.lastContact = new Date().getTime() / 1000;
                                                return true;
                                            }, function(e) {
                                                console.log("ERROR:", e.message, e.stack);
                                            });
                                        });
                                    });
                                });
                            }, function(error) {
                                console.log("import error:", error.message);
                            }).done();

                            item.lastContact = new Date().getTime() / 1000;
                            return true;
                        }
                        return false;
                    }

                    else if (command === "importDocument") {
                        this.handleMenuActionImportDocument();
                        return true;
                    }
                }

                throw new Error("Message refused, invalid data!");
            }

            throw new Error("Message refused, invalid sender!");
        }
    },

    handleMenuAction: {
        value: function(event) {
            var menuItem = event.detail,
                method = "handleMenuAction" + menuItem.identifier.substr(0, 1).toUpperCase() + menuItem.identifier.substr(1);

            if (typeof this[method] === "function") {
                this[method](event);
            }
        }
    },

    handleMenuActionImportDocument : {
        value: function() {
            var self = this,
                options = {
                    allowMultipleSelection: true,
                    canChooseDirectories: true,
                    fileTypes: ["com.adobe.pdf"],
                    displayAsSheet: false
                };

            if (this._import_reentrant_lock === true) {
                // the import dialog is already open, just ignore
                return;
            } else {
                this._import_reentrant_lock = true;
            }

            this.environmentBridge.promptForOpen(options).then(function(urls) {
                var promises = [];

                if (!urls || !urls.length) {
                    // user has canceled the prompt
                    delete self._import_reentrant_lock;
                    return;
                }

                if (!(urls instanceof Array)) {
                    urls = [urls];
                }

                urls.map(function(url) {
                    promises.push(self.environmentBridge.listTreeAtUrl(url, "*.plume").then(function(list){
                        list = list.filter(function (item) {
                            return item.name && (/.*\.pdf$/i).test(item.name);
                        });

                        var importItems = self.importItems,
                            newContent = [];

                        list.forEach(function(item) {
                            // check if not already in the queue getting imported or waiting
                            if (!importItems.some(function(object) {
                                return item.fileUrl === object.url && object.status !== IMPORT_STATES.ready;
                            })) {
                                var currentTime = new Date();
                                newContent.push({
                                    name: item.name,
                                    url: item.fileUrl,
                                    status: IMPORT_STATES.unknown,
                                    nbrPages: 0,
                                    currentPage: 0,
                                    processID: null,
                                    lastContact: 0,
                                    retries: 0,
                                    error: null,
                                    coverImage: null,
                                    id: (currentTime.getTime() % (3600 * 24)) * 1000000 + currentTime.getMilliseconds() * 1000 + Math.floor(Math.random() * 1000)
                                });
                            }
                        });
                        importItems.addEach(newContent);

                    }, function(error) {
                        console.log("ERROR", error.message, error.stack);
                    }));
                });

                Promise.allResolved(promises).then(function() {
                    console.log("URLS:", self.importItems);
                    var windowParams = {
                        url:"http://client/import-activity/index.html",
                        width:400,
                        height:600,
                        canResize:true,
                        showToolbar:false,
                        canOpenMultiple: false
                    };

                    self.upgradeItemsState();
                    self.environmentBridge.backend.get("application").invoke("openWindow", windowParams).done();
                }).done();

                delete self._import_reentrant_lock;
            }, function(error) {
                delete self._import_reentrant_lock;
            });
        }
    },

    _upgradeItemsStateTimer: {
        value: null
    },

    upgradeItemsState: {
        value: function() {
            var self = this;

            if (this._upgradeItemsStateTimer) {
                clearTimeout(this._upgradeItemsStateTimer);
            }

            this._upgradeItemsStateTimer = setTimeout(function() {
                self._upgradeItemsStateTimer = null;
                self.launchFetch();
                self.launchImport();
            }, 250);
        }
    },

    launchFetch: {
        value: function() {
            var self = this;

            // Check if we have an PDF info to fetch
            var nbrFetches = 0,
                sortedTable = [];

            // sort the items per status and retries count
            this.importItems.map(function(item) {
                var status = item.status,
                    retries = Math.floor(item.retries / 5);

                if (status === IMPORT_STATES.unknown) {
                    if (typeof sortedTable[retries] === "undefined") {
                        sortedTable[retries] = [item];
                    } else {
                        sortedTable[retries].push(item);
                    }
                } else if (status === IMPORT_STATES.fetching) {
                    nbrFetches ++;
                }
            });

            if (nbrFetches < MAX_CONCURENT_FETCHES) {
                var retries,
                    index,
                    item;

                for (retries in sortedTable) {
                    for (index in sortedTable[retries]) {
                        item = sortedTable[retries][index];

                        if (self.extension && typeof self.extension.getMetaData === "function") {
                            console.log("***** START FETCHING:", item.name, item.status, item.retries);
                            self.updateItemState(item, IMPORT_STATES.fetching);

                            self.extension.getMetaData(self.environmentBridge.backend, item).then(function(response) {
                                var id = response.id,
                                    metadata = response.metadata;

                                // let's match the metadata id with an item ID. We cannot rely on the variable item as we shared it for every items.
                                var itemRef = self._importItemForID(id);
                                if (itemRef) {
                                    self.updateItemState(itemRef, IMPORT_STATES.waiting);
                                    itemRef.metadata = itemRef.metadata || {};
                                    for (var property in metadata) {
                                        itemRef.metadata[property] = metadata[property];
                                    }
                                    return true;
                                }
                                return false;
                            }, function(e) {
                                var itemRef = self._importItemForID(e.id);
                                if (itemRef) {
                                    self.updateItemState(itemRef, IMPORT_STATES.fetchError);
                                    itemRef.retries ++;

                                    if (itemRef.retries < 3 ) {
                                        setTimeout(function() {
                                            itemRef.status = IMPORT_STATES.unknown;
                                            self.upgradeItemsState();
                                        }, 15000);
                                    } else {
                                        itemRef.error = e.error.message || e.error;
                                        self.updateItemState(itemRef, IMPORT_STATES.error);

                                        //JFD TODO: TEMPORARY-- after displaying the error for couple seconds, let just resume the import without the meta data...
                                        setTimeout(function() {
                                            self.updateItemState(itemRef, IMPORT_STATES.waiting);
                                            itemRef.metadata = itemRef.metadata || {};
                                        }, 5000);
                                    }

                                    self.upgradeItemsState();
                                }
                            });

                            nbrFetches ++;
                        } else {
                            item.status = IMPORT_STATES.waiting;
                        }

                        if (nbrFetches >=  MAX_CONCURENT_FETCHES) {
                            break;
                        }
                    }

                    if (nbrFetches >=  MAX_CONCURENT_FETCHES) {
                        break;
                    }
                }
            }
        }
    },

    launchImport: {
        value: function() {
            var self = this;

            // Check if we have a process to launch
            var nbrProcess = 0,
                waitings = [];

            // sort the processes per status and retries count
            this.importItems.map(function(item) {
                var status = item.status,
                    retries = Math.floor(item.retries / 5);

                if (status === IMPORT_STATES.waiting) {
                    if (waitings[retries] === undefined) {
                        waitings[retries] = [item];
                    } else {
                        waitings[retries].push(item);
                    }
                } else if (status === IMPORT_STATES.converting || status === IMPORT_STATES.stalled) {
                    nbrProcess ++;
                }
            });

            if (nbrProcess <  MAX_CHILDPROCESS) {
                for (var retries in waitings) {
                    for (var index in waitings[retries]) {
                        var item = waitings[retries][index];

                        console.log("***** START PROCESS:", item.name, item.status, item.retries);
                        self.import(item);
                        nbrProcess ++;

                        if (nbrProcess >=  MAX_CHILDPROCESS) {
                            break;
                        }
                    }

                    if (nbrProcess >=  MAX_CHILDPROCESS) {
                        break;
                    }
                }
            }
        }
    },

    import: {
        value: function(item) {
            console.log("STARTING PROCESS", item);

            item.lastContact = new Date().getTime() / 1000;
            this.updateItemState(item, IMPORT_STATES.converting);

            var windowParams = {
                url: "http://client/pdf-converter/index.html?id=" + encodeURIComponent(item.id),
                showWindow: false,
                canResize: true
            };

            if (item.retries) {
                windowParams.url += "&p=" + item.currentPage;
            }

            var application = this.environmentBridge.backend.get("application");
            application.invoke("windowList").then(function(result) {
                var windows = result.windows,
                    promises = [];

                windows.forEach(function(url) {
                    if (decodeURI(url).indexOf("http://client/pdf-converter/index.html") === 0) {
                        var params = {};
                        url.substr(url.indexOf("?") + 1).split("&").forEach(function(query) {
                            var param = query.split("=", 2);
                            params[param[0]] = param[1] !== undefined ? decodeURIComponent(param[1]) : null;
                        });

                        if (params.id === item.id) {
                            promises.push(application.invoke("closeWindow", url));
                        }
                    }
                });

                Promise.allResolved(promises).then(function() {
                    return application.invoke("openWindow", windowParams).then(function() {
                        console.log("PDF Converter for", windowParams.url, "launched");
                    });
                }).fail(function(e) {
                    console.log("ERROR:", e.message, e.stack);
                });
            }, function(e) {
                console.log("ERROR:", e.message, e.stack);
            }).done();
        }
    },

    optimize: {
        value: function(item) {
            // JFD TODO: Add an option to bypass image optimization
            if (1) {
                return this._optimizeImages(item, 0.6);             // JFD TODO: the quality should come from a setting somewhere...

            } else {
                console.log("--- no image optimization!");
                var deferred = Promise.defer();
                deferred.resolve(0);
                return deferred.promise;
            }
        }
    },

    buildTableOfContent: {
        value: function(meta) {
            var toc = meta.toc,
                maxDepth = 0,
                idCounter = 1;

            if (!toc) {
                meta.nav = "<ol></ol>";
                meta.tocmap = "";
                return;
            }

            var _generateNavTable = function(items, pading) {
                var result = pading + '<ol>';

                items.forEach(function(item) {
                    var title = item.title;

                    title = title.replace(/&/g, "&amp;");
                    title = title.replace(/</g, "&lt;");
                    title = title.replace(/>/g, "&gt;");

                    result += pading + '<li>';
                    if (item.pageNumber) {
                        result += pading + '\t<a href="pages/' + item.pageNumber + '.xhtml">' + title + '</a>';
                    } else {
                        result += pading + '\t' + title;
                    }
                    if (item.items && item.items.length) {
                        result += _generateNavTable(item.items, pading + "\t");
                    }
                    result += pading + '</li>';
                });

                result += pading + "</ol>";
                return result;
            };

            var _generateTocTable = function(items, pading, depth) {
                var result = "";

                // JFD TODO: add entry for cover page

                depth = depth || 1;
                if (depth > maxDepth) {
                    maxDepth = depth;
                }

                items.forEach(function(item) {
                    var title = item.title;

                    title = title.replace(/&/g, "&amp;");
                    title = title.replace(/</g, "&lt;");
                    title = title.replace(/>/g, "&gt;");

                    result += pading + '<navPoint id="np' + idCounter + '" playOrder="' + idCounter + '">';
                    result += pading + '\t<navLabel><text>' + title + '</text></navLabel>';
                    if (item.pageNumber) {
                        result += pading + '\t<content src="pages/' + item.pageNumber + '.xhtml"/>';
                    }

                    idCounter ++;

                    if (item.items && item.items.length) {
                        result += _generateTocTable(item.items, pading + "\t", depth + 1);
                    }
                    result += pading + '</navPoint>';
                });

                return result;
            };


            meta.nav = _generateNavTable(toc, "\n\t\t\t");
            meta.tocmap = _generateTocTable(toc, "\n\t\t");
            meta["tocmap-depth"] = maxDepth;
        }
    },

    generateEpub: {
        value: function(item) {
            var self = this;

            // Retrieve cover image URL
            return self.environmentBridge.backend.get("plume-backend").invoke("getCoverImage", item.destination).then(function(coverImage) {
                console.log("COVER IMAGE:", coverImage);
                if (coverImage) {
                    item.coverImage = coverImage;
                }

                self.updateItemState(item, IMPORT_STATES.generating);
                return self.environmentBridge.backend.get("plume-backend").invoke("updateContentInfo", item.destination, item.meta).then(function() {
                    return self.environmentBridge.backend.get("plume-backend").invoke("generateEPUB3", item.destination, item.name).then(function(stdout) {
                        self.updateItemState(item, IMPORT_STATES.ready);
                    });
                });
            });
        }
    },

    updateItemState: {
        value: function(item, status, currentPage, nbrPages, destination) {
            var self = this,
                ipc = this.environmentBridge.backend.get("ipc"),
                statusChanged = false;

            if (typeof status === "number") {
                item.status = status;
                statusChanged = true;
            }

            if (currentPage !== null && currentPage !== undefined) {
                item.currentPage = currentPage;
            }

            if (nbrPages !== null && nbrPages !== undefined) {
                item.nbrPages = nbrPages;
            }

            if (destination !== null && destination !== undefined) {
                item.destination = destination;
            }

            ipc.invoke("namedProcesses", "monitor").then(function(processID) {
                if (processID) {
                    return ipc.invoke("send", self.processID, processID[0], ["itemUpdate", item]);
                }
            }).fail(function(e){
                console.log("ERROR:", e.message, e.stack);
            }).done();

            if (statusChanged) {
                this.upgradeItemsState();
            }
        }
    },

    checkImporters: {
        value: function() {
            var self = this;

            var now = new Date().getTime() / 1000;
            this.importItems.map(function(item) {
                if (item.status === IMPORT_STATES.converting && item.lastContact) {
                    if (Math.round(now - item.lastContact) >= STALL_TIMEOUT) {
                        self.updateItemState(item, IMPORT_STATES.stalled, item.currentPage, item.nbrPages, item.destination, item.meta);
                    }

                } else if (item.status === IMPORT_STATES.stalled) {
                    if (Math.round(now - item.lastContact) >= RESTART_TIMEOUT && item.processID) {
                        // jumpstart the import...
                        self.environmentBridge.backend.get("ipc").invoke("send", self.processID, item.processID, ["close"]).then(function() {
                            item.retries = (item.retries || 0) + 1;
                            item.lastContact = now;
                            item.processID = 0;
                            setTimeout(function() {
                                self.updateItemState(item, IMPORT_STATES.waiting, item.currentPage, item.nbrPages, item.destination, item.meta);
                            }, 500);    // We need to give some time for the window to go away
                        }, function(e){
                            // JFD TODO: Kill the old process
                            item.retries = (item.retries || 0) + 1;
                            item.lastContact = now;
                            item.processID = 0;
                            self.updateItemState(item, IMPORT_STATES.waiting, item.currentPage, item.nbrPages, item.destination, item.meta);
                        }).done();
                    }
                }
            });
        }
    },

    _optimizeImages: {
        value: function(item, quality) {
            var self = this,
                folderURL = item.destination;

            console.log("optimizeImages quality:", quality);

            // Before optimizing the images, let's duplicate them to save the originals
            return this.environmentBridge.backend.get("plume-backend").invoke("saveOriginalAssets", folderURL).then(function() {
                return self.environmentBridge.backend.get("plume-backend").invoke("getImagesInfo", folderURL).then(function(infos) {
                    var urls = Object.keys(infos),
                        currentImage = 0,
                        nbrImages = urls.length;

                    item.currentPage = 0;
                    item.nbrPages = urls.length;

                    var _optimizeNextBatch = function() {
                        var promises = [],
                            i = 0;

                        while (currentImage < nbrImages) {
                            var url = urls[currentImage ++],
                                originalURL,
                                info = infos[url],
                                maxWidth = 0,
                                maxHeight = 0;

                            info.usage.forEach(function(usage) {
                                maxWidth = Math.max(maxWidth, usage.width);
                                maxHeight = Math.max(maxHeight, usage.height);
                            });

                            var ratio = 1;
                            if (maxWidth < info.width && maxHeight < info.height) {
                                ratio = Math.min(maxWidth / info.width, maxHeight / info.height);
                            }

                            originalURL = url.replace("/OEBPS/assets/", "/original-assets/");
                            promises.push(self.environmentBridge.backend.get("plume-backend").invoke("optimizeImage",
                                originalURL, url, {width:Math.round(info.width * ratio), height:Math.round(info.height * ratio)}, quality).then(function() {
                                    self.updateItemState(item, IMPORT_STATES.optimizing, ++ item.currentPage, item.nbrPages, item.destination, item.meta);
                                }));

                            if (++ i > 4) {
                                break;
                            }
                        }

                        self.updateItemState(item, IMPORT_STATES.optimizing, item.currentPage, item.nbrPages, item.destination, item.meta);

                        if (promises.length) {
                            return Promise.allResolved(promises).then(function() {
                                if (currentImage < nbrImages) {
                                    return _optimizeNextBatch();
                                }
                            });
                        }

                        return null;
                    };

                    return Promise.when(_optimizeNextBatch());

                });
            });
        }
    },

    _importItemForID: {
        value: function(itemID) {
            var item = null,
                id = parseInt(itemID, 10);

            this.importItems.some(function(object) {
                if (id === object.id) {
                    item = object;
                    return true;
                }
                return false;
            });

            return item;
        }
    }

});
