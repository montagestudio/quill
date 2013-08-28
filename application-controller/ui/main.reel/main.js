/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    defaultMenu = require("ui/native-menu/menu").defaultMenu,
    defaultEventManager = require("montage/core/event/event-manager").defaultEventManager;


var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

// Constants
// Constants (must match STATUS in import-activity/ui/activity-list-item.reel/activity-list-item.js)

var STATUS_WAITING = 0,
    STATUS_IMPORTING = 1,
    STATUS_STALLED = 2,
    STATUS_IMPORT_COMPLETED = 3,
    STATUS_OPTIMIZING = 4,
    STATUS_GENERATING_EPUB = 5,
    STATUS_READY = 10,

    MAX_CHILDPROCESS = 2;

    CHECK_INTERVAL  = 10,
    STALL_TIMEOUT = 30,
    RESTART_TIMEOUT = 60;


exports.Main = Montage.create(Component, {

    //TODO not show ui until we have an environment bridge
    //This would be a good case of the whole "custom loading scenario" idea
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

    importItems: {
        value: []
    },

    importDestinationPath: {
        value: null
    },

    didCreate: {
        value: function () {
            var self = this;
            if (IS_IN_LUMIERES) {

                require.async("core/lumieres-bridge").then(function (exported) {
                    self.environmentBridge = exported.LumiereBridge.create();

                    self.environmentBridge.connectionHandler = self;
                    var backend = self.environmentBridge.backend; // force open backend connection

                    self.environmentBridge.userPreferences.then(function (prefs) {
                        if (typeof prefs.importDestinationPath !== "string" || !prefs.importDestinationPath.length) {
                            self.environmentBridge.backend.get("application").invoke("specialFolderURL", "documents", "user").then(function(path) {
                                self.importDestinationPath = path.url + "/" + lumieres.applicationName;
                                lumieres.setUserPreferences({importDestinationPath: self.importDestinationPath}, function (error, result) {
                                    if (error) {
                                        console.warm("Cannot set preferences")
                                    }
                                });
                            }).done();
                        } else {
                            self.importDestinationPath = prefs.importDestinationPath;
                        }
                        self.needsDraw = true;
                    }).done();
                });

                window.setInterval(function() { self.checkImporters() }, CHECK_INTERVAL * 1000);

            } else {
                alert("Plume cannot be run outside of Lumieres!");
                return;
            }
        }
    },

    enterDocument: {
        value: function(firstTime) {
            if (firstTime) {
                console.log("MENU:", defaultMenu.menuItemForIdentifier("importDocument"));
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
                console.log("processID:", processID);
                self._processID = processID;
            }, function(e) {
                    console.log("ERROR:", e.message, e.stack)
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
            var self = this;

            to = parseInt(to, 10);

            if (to === this.processID) {
                if (data && data.length) {
                    var command = data[0];

                    if (command === "getImportItems") {
                        return this.importItems;
                    }

                    else if (command == "removeItem") {
                        var items = this.importItems,
                            length = items.length,
                            i;

                        for (i = 0; i < length; i ++) {
                            if (items[i].id === parseInt(data[1].id, 10)) {
                                if (items[i].processID) {
                                   // Stop the import before removing the item from the list...
                                    this.environmentBridge.backend.get("ipc").invoke("send", self.processID, items[i].processID, ["close"]).fail(function(e){
                                        console.log("ERROR:", e.message, e.stack)
                                    }).done();
                                }

                                items.splice(i, 1);
                                this.launchProcess();
                                return true;
                            }
                        }
                        return false;
                    }

                    else if (command === "converterInfo") {
                        return this.importItems.some(function(object) {
                            if (parseInt(data[1].id, 10) === object.id) {
                                object.processID = data[1].processID;
                                object.lastContact = new Date().getTime() / 1000;
                                return true;
                            }
                            return false;
                        });
                    }

                    else if (command === "itemUpdate") {
                        return this.importItems.some(function(object) {
                            if (parseInt(data[1].id, 10) === object.id) {
                                self.updateItemState(object, data[1].status, data[1].currentPage, data[1].nbrPages, data[1].destination, data[1].meta)
                                object.lastContact = new Date().getTime() / 1000;
                                return true;
                            }
                            return false;
                        });
                    }

                    else if (command === "importDone") {
                        return this.importItems.some(function(object) {
                            if (parseInt(data[1].id, 10) === object.id) {
                                object.meta = data[1].meta;

                                self.optimize(object).then(function() {
                                    object.lastContact = new Date().getTime() / 1000;
                                    self.generateEpub(object).then(function() {
                                        object.lastContact = new Date().getTime() / 1000;
                                        return true;
                                    }, function(e) {
                                        console.log("ERROR:", e.message, e.stack);
                                    }).done();
                                });

                                object.lastContact = new Date().getTime() / 1000;
                                return true;
                            }
                            return false;
                        });
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
                }

            if (this._import_reentrant_lock === true) {
                // the import dialog is already open, just ignore
                return;
            } else {
                this._import_reentrant_lock = true;
            }

            this.environmentBridge.promptForOpen(options).then(function(urls) {
                var items = [],
                    promises = [];

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
                                return item.fileUrl === object.url && object.status !== STATUS_READY;
                            })) {
                                var currentTime = new Date();
                                newContent.push({
                                    name: item.name,
                                    url: item.fileUrl,
                                    status: STATUS_WAITING,
                                    nbrPages: 0,
                                    currentPage: 0,
                                    processID: null,
                                    lastContact: 0,
                                    retries: 0,
                                    id: (currentTime.getTime() % (3600 * 24)) * 1000000 + currentTime.getMilliseconds() * 1000 + Math.floor(Math.random() * 1000)
                                });
                            }
                        });
                        importItems.addEach(newContent);

                    }, function(error) {
                        console.log("ERROR", error.message, error.stack)
                    }));
                });

                Promise.allResolved(promises).then(function() {
                    console.log("URLS:", self.importItems);
                    var windowParams = {
                        url:"http://client/import-activity/index.html",
                        width:400, height:600, canResize:true,
                        showToolbar:false, canOpenMultiple: false
                    };

                    self.launchProcess();
                    console.log("--- openeing window", windowParams);
                    self.environmentBridge.backend.get("application").invoke("openWindow", windowParams).done();
                }).done();

                delete self._import_reentrant_lock;
            }, function(error) {
                delete self._import_reentrant_lock;
            });
        }
    },

    launchProcess: {
        value: function(forceRelaunch) {
            var self = this;

            // Check if we have a process to launch
            var nbrProcess = 0,
                waitings = [];

            // sort the processes per status and retries count
            this.importItems.map(function(item) {
                var status = item.status,
                    retries = item.retries;

                if (status == STATUS_WAITING) {
                    if (waitings[retries] === undefined) {
                        waitings[retries] = [item];
                    } else {
                        waitings[retries].push(item);
                    }
                } else if (status == STATUS_IMPORTING || status == STATUS_STALLED) {
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
            this.updateItemState(item, STATUS_IMPORTING);

            var windowParams = {
                url: "http://client/pdf-converter/index.html?source=" + encodeURIComponent(item.url) + "&id=" + encodeURIComponent(item.id),
                showWindow: false,
                canResize: true
            };

            if (item.retries) {
                windowParams.url += "&p=" + item.currentPage + "&dest=" + encodeURIComponent(item.destination);
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
                        if (params.source === item.url) {
                            promises.push(application.invoke("closeWindow", url));
                        }
                    }
                });

                return Promise.allResolved(promises).then(function() {
                    return application.invoke("openWindow", windowParams).then(function() {
                        console.log("PDF Converter for", windowParams.url, "launched");
                    });
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
                return this._optimizeImages(item);
            } else {
                console.log("--- no image optimization!")
                var deferred = Promise.defer();
                deferred.resolve(0);
                return deferred.promise;
            }
        }
    },

    generateEpub: {
        value: function(item) {
            var self = this;
            self.updateItemState(item, STATUS_GENERATING_EPUB);

            this._buildTableOfContent(item.meta);

            // Update the content.opf - this is optional at this stage
            return self.environmentBridge.backend.get("plume-backend").invoke("updateContentInfo", item.destination, item.meta).then(function() {
                return self.environmentBridge.backend.get("plume-backend").invoke("generateEPUB3", item.destination, item.name).then(function(stdout) {
                    self.updateItemState(item, STATUS_READY);
                });
            });
        }
    },

    updateItemState: {
        value: function(item, status, currentPage, nbrPages, destination, meta) {
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
//                    console.log("ERROR:", e.message, e.stack)
            }).done();

            if (statusChanged) {
                this.launchProcess();
            }
        }
    },

    checkImporters: {
        value: function() {
            var self = this;

            var now = new Date().getTime() / 1000;
            this.importItems.map(function(item) {
                if (item.status === STATUS_IMPORTING && item.lastContact) {
                    if (Math.round(now - item.lastContact) >= STALL_TIMEOUT) {
                        self.updateItemState(item, STATUS_STALLED, item.currentPage, item.nbrPages, item.destination, item.meta)
                    }

                } else if (item.status === STATUS_STALLED) {
                    if (Math.round(now - item.lastContact) >= RESTART_TIMEOUT && item.processID) {
                        // jumpstart the import...
                        self.environmentBridge.backend.get("ipc").invoke("send", self.processID, item.processID, ["close"]).then(function() {
                            item.retries = (item.retries || 0) + 1;
                            item.lastContact = now;
                            item.processID = 0;
                            setTimeout(function() {
                                self.updateItemState(item, STATUS_WAITING, item.currentPage, item.nbrPages, item.destination, item.meta);
                            }, 500);    // We need to give some time for the window to go away
                        }, function(e){
                            // JFD TODO: Kill the old process
                            item.retries = (item.retries || 0) + 1;
                            item.lastContact = now;
                            item.processID = 0;
                            self.updateItemState(item, STATUS_WAITING, item.currentPage, item.nbrPages, item.destination, item.meta);
                        }).done();
                    }
                }
            });
        }
    },

    _buildTableOfContent: {
        value: function(meta) {
            var toc = meta.toc;

            if (!toc) {
                meta.toc = "<ol></ol>";
                return;
            }

            var _generateTable = function(items, pading) {
                var result = pading + '<ol>';

                items.forEach(function(item) {
                    var title = item.title;

                    title = title.replace(/&/g, "&amp;");
                    title = title.replace(/</g, "&lt;");
                    title = title.replace(/>/g, "&gt;");

                    result += pading + '<li>';
                    result += pading + '\t<a href="pages/' + item.pageNumber + '.xhtml">' + title + '</a>';
                    if (item.items && item.items.length) {
                        result += _generateTable(item.items, pading + "\t");
                    }
                    result += pading + '</li>';
                });

                result += pading + "</ol>";
                return result;
            }

            meta.toc = _generateTable(toc, "\n\t\t\t");
        }
    },

    _optimizeImages: {
        value: function(item) {
            var self = this,
                folderURL = item.destination,
                quality = 0.6;                  // JFD TODO: should come from a setting somewhere...

            console.log("optimizeImages quality:", quality)
            return this.environmentBridge.backend.get("plume-backend").invoke("getImagesInfo", folderURL).then(function(infos) {
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
                        promises.push(self.environmentBridge.backend.get("plume-backend").invoke("optimizeImage",
                            url, {width:Math.round(info.width * ratio), height:Math.round(info.height * ratio)}, quality).then(function() {
                                self.updateItemState(item, STATUS_OPTIMIZING, ++ item.currentPage, item.nbrPages, item.destination, item.meta);
                        }));

                        if (++ i > 4) {
                            break;
                        }
                    }

                    self.updateItemState(item, STATUS_OPTIMIZING, item.currentPage, item.nbrPages, item.destination, item.meta);

                    if (promises.length) {
                        return Promise.allResolved(promises).then(function() {
                            if (currentImage < nbrImages) {
                                return _optimizeNextBatch();
                            }
                        });
                    }

                    return null;
                }

                return Promise.when(_optimizeNextBatch());

            });
        }
    }

});
