/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    defaultMenu = require("ui/native-menu/menu").defaultMenu,
    defaultEventManager = require("montage/core/event/event-manager").defaultEventManager;


var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

// Constants
var STATUS_WAITING = 0,
    STATUS_IMPORTING = 1,
    STATUS_READY = 2,

    MAX_CHILDPROCESS = 2;


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

    childProcessIDs: {
        value: []
    },

    importItems: {
        value: []
    },

    didCreate: {
        value: function () {
console.log("ACTIVITY MONITOR CREATED");
foo = this;

            var self = this;
            if (IS_IN_LUMIERES) {

                require.async("core/lumieres-bridge").then(function (exported) {
                    self.environmentBridge = exported.LumiereBridge.create();

                    self.environmentBridge.connectionHandler = self;
                    var backend = self.environmentBridge.backend; // force open backend connection

                    self.environmentBridge.userPreferences.then(function (prefs) {
                        self.needsDraw = true;
                    });
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
            console.log("---onIPCMessage", from, to, data)

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
                            if (items[i].url === data[1].url) {
                                console.log("--- removeItem", items[i]);
                                if (items[i].processID) {
                                    console.log("--- removeItem", items[i].processID);
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
                            if (data[1].url === object.url) {
                                object.processID = data[1].processID;
                                return true;
                            }
                            return false;
                        });
                    }

                    else if (command === "itemUpdate") {
                        return this.importItems.some(function(object) {
                            if (data[1].url === object.url) {
                                self.updateItemState(object, data[1].status, data[1].currentPage, data[1].nbrPages)
                                return true;
                            }
                            return false;
                        });
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
                            // check if not already in the content
                            if (!importItems.some(function(object) {
                                return item.fileUrl === object.url;
                            })) {
                                newContent.push({
                                    name: item.name,
                                    url: item.fileUrl,
                                    status: STATUS_WAITING,
                                    nbrPages: 0,
                                    currentPage: 0,
                                    processID: null
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
            console.log("-- launchProcess", this.importItems)
            // Check if we have a process to launch
            var nbrProcess = 0;

            this.importItems.some(function(item) {
                if (nbrProcess >=  MAX_CHILDPROCESS) {
                    return false;
                }

                if (item.status === STATUS_WAITING) {
                    self.import(item);
                    nbrProcess ++;
                } else if (item.status == STATUS_IMPORTING) {
                    if (forceRelaunch === true) {
                        self.import(item);
                    }
                    nbrProcess ++;
                }
            });
        }
    },

    import: {
        value: function(item) {
            console.log("STARTING PROCESS", item.name);
            this.updateItemState(item, STATUS_IMPORTING);
//            self.childProcessIDs.push(item.name);

            var windowParams = {
                url: "http://client/pdf-converter/index.html?path=" + encodeURIComponent(item.url),
                showWindow: false
            };

            this.environmentBridge.backend.get("application").invoke("openWindow", windowParams).then(function() {
                console.log("PDF Converter for", item.url, "launched");
            });
        }
    },

    updateItemState: {
        value: function(item, status, currentPage, nbrPages) {
            var self = this,
                ipc = this.environmentBridge.backend.get("ipc"),
                statusChanged = false;

            if (status !== null && status !== undefined) {
                if (status == "success") {
                    item.status = STATUS_READY;
                    statusChanged = true;
                } else if (typeof status === "number") {
                    item.status = status;
                }
            }

            if (currentPage !== null && currentPage !== undefined) {
                item.currentPage = currentPage;
            }

            if (nbrPages !== null && nbrPages !== undefined) {
                item.nbrPages = nbrPages;
            }

            ipc.invoke("namedProcesses", "monitor").then(function(processID) {
                console.log("--- updateItemState", processID)
                if (processID) {
                    return ipc.invoke("send", self.processID, processID[0], ["itemUpdate", item]);
                }
            }).fail(function(e){
                    console.log("ERROR:", e.message, e.stack)
            }).done();

            if (statusChanged) {
                this.launchProcess();
            }
        }
    }

});
