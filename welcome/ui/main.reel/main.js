/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    HistoryItemConverter = require("welcome/core/history-item-converter").HistoryItemConverter;

var IS_IN_LUMIERES = (typeof lumieres !== "undefined");

exports.Main = Component.specialize({

    version: {
        value: "X"
    },

    recentDocuments: {
        value: null
    },

    isFirstRun: {
        value: true
    },

    constructor: {
        value: function Main() {
            this.super();

            var self = this;
            if (IS_IN_LUMIERES) {
                this.version = lumieres.version;

                this.defineBinding("recentDocuments", {
                    "<-": "recentDocuments",
                    source: lumieres
                });

                require.async("core/lumieres-bridge").then(function (exported) {
                    self.environmentBridge = exported.LumiereBridge.create();
                    self.environmentBridge.userPreferences.then(function (prefs) {
                        self.isFirstRun = prefs.firstRun;
                        //TODO I don't want firstrun to be set-able as an API, but this feels a little weird
                        self.needsDraw = true;
                    });

                });
            } else {
                require.async("core/browser-bridge").then(function (exported) {
                    self.environmentBridge = exported.BrowserBridge.create();
                });
            }
        }
    },

    //TODO not show ui until we have an environment bridge
    //This would be a good case of the whole "custom loading scenario" idea
    environmentBridge: {
        value: null
    },

    handleOpenDocument: {
        value: function (evt) {
            this.environmentBridge.open(evt.detail.url).then(function () {
                window.close();
            }).done();
        }
    },

    handleOpenAppButtonAction: {
        value: function () {
            var self = this;
            this.environmentBridge.promptForOpen({canChooseDirectories: true}).then(function (url) {
                if (url) {
                    return self.environmentBridge.open(url).then(function () {
                        window.close();
                    });
                }
            }).done();
        }
    },

    handleNewAppButtonAction: {
        value: function () {
            this.environmentBridge.openNewApplication().then(function () {
                window.close();
            }).done();
        }
    },


    handleImportButtonAction: {
        value: function () {
            var self = this,
                ipc = this.environmentBridge.backend.get("ipc");

            if (this._isImporting) {
                return;
            }
            this._isImporting = true;

            ipc.invoke("namedProcesses", "app-controller").then(function(processID) {
                if (processID) {
                    return ipc.invoke("send", "anonymous", processID[0], ["importDocument", null]);
                }
            }).then(function() {
                delete self._isImporting;
            }, function(error) {
                console.warn("ERROR:", error.message, error.stack)
                delete self._isImporting;
            }).done()
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
    }

});
