/* global lumieres,alert */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    RangeController = require("montage/core/range-controller").RangeController,
    IMPORT_STATES = require("core/importStates").importStates;

var IS_IN_LUMIERES = (typeof lumieres !== "undefined");


exports.Main = Component.specialize({

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

//    isFirstRun: {
//        value: true
//    },

    contentController: {
        value: null
    },

    destination: {
        value: null
    },

    constructor: {
        value: function Main() {
            var self = this;
            if (IS_IN_LUMIERES) {
                require.async("adaptor/client/core/lumieres-bridge").then(function (exported) {
                    self.environmentBridge = new exported.LumiereBridge().init("plume-backend");

                    self.environmentBridge.connectionHandler = self;
                    var backend = self.environmentBridge.backend; // force open backend connection

                    self.environmentBridge.userPreferences.then(function (prefs) {
                        self.destination = prefs.importDestinationPath.substring("fs://localhost".length);
                        self.needsDraw = true;
                    });
                });
            } else {
                alert("Plume cannot be run outside of Lumieres!");
                return;
            }

            this.contentController = RangeController.create().initWithContent([]);
        }
    },

    enterDocument: {
        value: function(firstTime) {
            if (firstTime) {
                window.addEventListener("reopen", this);
//                if (window.location.search.indexOf("prompt=true") !== -1) {
//                    this.addDocuments();
//                }
                this.restoreContent();
//                this.launchProcess(true);
            }
        }
    },

    draw: {
        value: function () {
//            if (this.isFirstRun) {
//                this.element.classList.add("isFirstRun");
//            } else {
//                this.element.classList.remove("isFirstRun");
//            }
        }
    },

//    saveContent: {
//        value: function() {
//            localStorage.setItem("activities", JSON.stringify(this.contentController.content));
//        }
//    },

    restoreContent: {
        value: function() {
//            var data = localStorage.getItem("activities");
//
//            if (data) {
//                data = JSON.parse(data);
//            } else {
//                data = [];
//            }
//            this.contentController.content = data;
            console.log("--restoreContent");

            var self = this,
                ipc = this.environmentBridge.backend.get("ipc");

            ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                if (processID) {
                    return ipc.invoke("send", self.processID, processID[0], ["getImportItems"]).then(function(items) {
                        self.contentController.content = items;
                    }, function(error) {
                        console.log("ERROR", error.message);
                    });
                }
            }).done();
        }
    },

    handleReopen: {
        value: function(event) {
//            console.log("REOPEN:", event.detail);
//            if (event.detail.indexOf("prompt=true") !== -1) {
//                this.addDocuments();
//            }

            this.restoreContent();
        }
    },

    handleCloseButtonAction: {
        value: function (event) {
            var item = event.detail.get("associatedObject");

            if (item) {
//                this.contentController.delete(item);
//                this.saveContent();
//                this.launchProcess();

                var self = this,
                    ipc = this.environmentBridge.backend.get("ipc");

                ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                    return ipc.invoke("send", self.processID, processID, ["removeItem", item]);
                }).then(function(removed) {
                    if (removed) {
                        self.contentController.delete(item);
                    }
                }).done();
            }
        }
    },

    handleOpenButtonAction: {
        value: function (event) {
            var item = event.detail.get("associatedObject");
            console.log("OPEN BUTTON", item);

            if (item) {
                var self = this,
                    ipc = this.environmentBridge.backend.get("ipc"),
                    pos = item.destination.lastIndexOf("/"),
//                    fileName = item.destination.substr(pos + 1),
                    params = {url: encodeURI(item.destination)};

                this.environmentBridge.backend.get("application").invoke("openDocument", params).then(function() {
//                    return ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
//                        return ipc.invoke("send", self.processID, processID, ["removeItem", item]);
//                    }).then(function(removed) {
//                        if (removed) {
//                            self.contentController.delete(item);
//                        }
//                    });
                }).done();
            }
        }
    },

    handleClearButtonAction: {
        value: function (event) {
            var self = this,
                ipc = this.environmentBridge.backend.get("ipc"),
                itemsToDelete = [];

            this.contentController.content.forEach(function(item) {
                if (item.status === IMPORT_STATES.ready) {
                    itemsToDelete.push(item);
                }
            });

            ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                itemsToDelete.forEach(function(item) {
                    ipc.invoke("send", self.processID, processID, ["removeItem", item]).then(function(removed) {
                        if (removed) {
                            self.contentController.delete(item);
                        }
                    }).done();
                });
            }).done();

        }
    },

    onConnect: {
        value: function() {
            var self = this;

            // Register the window with the IPC extension
            this.environmentBridge.backend.get("ipc").invoke("register", "monitor", this.processID, Promise.master(function() {
                return self.onIPCMessage.apply(self, arguments);
            }), true).then(function(processID){
                console.log("-- monitor process id:", processID);
                self._processID = processID;
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

            if (to === this.processID) {
                console.log("RECEIVED AN IPC MESSAGE FROM", from + ":", data);
                if (data && data.length) {
                    if (data[0] === "itemUpdate") {
                        var item = data[1];

                        if (item) {
                            this.contentController.content.some(function (object) {
                                if (object.id === parseInt(item.id, 10)) {
                                    for (var property in item) {
                                        if (item.hasOwnProperty(property) && object[property] !== item[property]) {
                                            object[property] = item[property];
                                        }
                                    }
                                    return true;
                                }
                                return false;
                            });
                        }
                        return this.importItems;
                    }
                }

                throw new Error("Message refused, invalid data!");
            }
            throw new Error("Message refused!");
        }
    }

});
