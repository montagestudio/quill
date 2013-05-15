/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    RangeController = require("montage/core/range-controller").RangeController;


var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

// Constants
var STATUS_WAITING = 0,
    STATUS_IMPORTING = 1

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

    isFirstRun: {
        value: true
    },

    contentController: {
        value: null
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
                        self.isFirstRun = prefs.firstRun;
                        //TODO I don't want firstrun to be set-able as an API, but this feels a little weird
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
            if (this.isFirstRun) {
                this.element.classList.add("isFirstRun");
            } else {
                this.element.classList.remove("isFirstRun");
            }
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
console.log("--restoreContent")

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

    onConnect: {
        value: function() {
            var self = this;

            // Register the window with the IPC extension
            this.environmentBridge.backend.get("ipc").invoke("register", "monitor", this.processID, Promise.master(function() {
                return self.onIPCMessage.apply(self, arguments);
            }), true).then(function(processID){
                console.log("processID:", processID);
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
                                if (object.url === item.url) {
                                    object.status = item.status;
                                    object.currentPage = item.currentPage;
                                    object.nbrPages = item.nbrPages;
                                    return true;
                                }
                                return false;
                            })
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
