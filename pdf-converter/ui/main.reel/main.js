/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise;


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

    didCreate: {
        value: function () {
            var self = this;

foo = this;
console.log("PDF CONVERTER CREATED", window.location.search);

            if (IS_IN_LUMIERES) {

                var params = [];
                window.location.search.substr(1).split("&").forEach(function(query) {
                    var param = query.split("=", 2);
                    params[param[0]] = param[1] !== undefined ? decodeURIComponent(param[1]) : null;
                });

                // add the path to the document title (for easy debugging)
                if (params["path"]) {
                    document.title = document.title + " - " + params["path"].substr("fs://localhost".length);
                    this.url =  params["path"];
                }

                require.async("core/lumieres-bridge").then(function (exported) {
                    self.environmentBridge = exported.LumiereBridge.create();

                    self.environmentBridge.connectionHandler = self;
                    var backend = self.environmentBridge.backend; // force open backend connection
                });

setTimeout(function() {
    var nbrPages = Math.round(Math.random() * 20 + 5),
        currentPage = 0;

    setTimeout(function(timer) {
        currentPage ++;

        if (currentPage <= nbrPages) {
            self.updateState(null, currentPage, nbrPages);
            setTimeout(arguments.callee, Math.round(Math.random() * 5 + 1) * 300);
        } else {
            console.log("--- DONE!!!")
            self.updateState("success").then(function(){
                window.close();
            }).done();
        }
    }, Math.round(Math.random() * 5 + 1)) * 300;
}, 1000)

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

                // Let inform o the app controller that we are here...
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
        value: function(status, currentPage, nbrPages) {
            var self = this,
                ipc = this.environmentBridge.backend.get("ipc");

 console.log("--- updateState", currentPage, nbrPages);

            return ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                if (processID) {
                    return ipc.invoke("send", self.processID, processID[0], ["itemUpdate", {url: self.url, status: status, currentPage: currentPage, nbrPages: nbrPages }]);
                }
            });
        }
    }

});
