/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise,
    adaptConnection = require("q-connection/adapt"),
    Connection = require("q-connection");

var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

exports.Main = Montage.create(Component, {

    params: {
        value: {
        }
    },

    _processID: {
        value: undefined
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
                        var reconnected = self.backend;
                    }, 250)
                });
                self._backend = Connection(connection);

                // Re-register the process with the IPC
                if (self._processID) {
                    self.backend.get("ipc").invoke("register", self._processID, Promise.master(function() {
                        return self.onIPCMessage.apply(self, arguments);
                    })).then(function(processID){
                        self._processID = processID;
                        console.log("reconnected to ipc with id:", processID)
                    })
                }
            }

            return self._backend;
        }
    },

    didCreate: {
        value: function () {
        }
    },

    templateDidLoad: {
        value: function() {
            var self = this;

            console.log("templateDidLoad");
            foo = this;

            var searches = document.location.search.substr(1).split("&"),
                i;

            for (i in searches) {
                var param = searches[i].split("=");
                this.params[unescape(param[0])] = param.length > 1 ? unescape(param[1]) : null;
            }
            console.log(this.params);

////            setupLocalFileSystem(function(fs, error) {
//                if (error === undefined) {
//                    console.log('Opened file system: ' + fs.name, fs);
//                    globalScope.fs = fs;
//                }
//
//                loadPDFDocument("samples/hello.pdf", function(pdf, page) {
//                   console.log("pdf document loaded", pdf, page);
//               })
////            });

//            if (this.params.file) {
//                windowParams = {
//                    url: "http://client/importer.html?path=" + this.params.file
//                };
//                this.backend.get("application").invoke("openWindow", windowParams).then(function() {
//
//                });
//            }

            // Register the window for IPC
            this.backend.get("ipc").invoke("register", 0, Promise.master(function() {
                return self.onIPCMessage.apply(self, arguments);
            })).then(function(processID){
                console.log("processID:", processID);
                self._processID = processID;
            })
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
    }
});
