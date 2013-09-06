var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component;

// Constants (must match STATUS in application-controller/ui/main.reel/main.js)
var STATUS_WAITING = 0,
    STATUS_IMPORTING = 1,
    STATUS_STALLED = 2,
    STATUS_IMPORT_COMPLETED = 3,
    STATUS_OPTIMIZING = 4,
    STATUS_GENERATING_EPUB = 5,
    STATUS_READY = 10;

exports.ActivityListItem = Component.specialize({

    item: {
        value: null
    },

    statusLabel: {
        value: ""
    },

    status: {
        get: function() {
            return this.item.status
        },

        set: function(value) {
            this.setStatusLabel();
        }
    },

    currentPage: {
        get: function() {
            return this.item.currentPage
        },

        set: function(value) {
            this.setStatusLabel();
        }
    },

    nbrPages: {
        get: function() {
            return this.item.nbrPages
        },

        set: function(value) {
            this.setStatusLabel();
        }
    },

    setStatusLabel: {
        value: function() {
            // JFD TODO: L10n

            var item = this.item;

            if (item.status === STATUS_WAITING) {
                this.statusLabel = "Waiting..."
            }

            else if (item.status === STATUS_IMPORTING || item.status == STATUS_STALLED) {
                if (item.currentPage > 0 && item.nbrPages > 0) {
                    this.statusLabel = "Importing page " + item.currentPage + " of " + item.nbrPages;
                } else {
                    this.statusLabel = "Importing..."
                }

                if (item.status == STATUS_STALLED) {
                    this.statusLabel += " (stalled)";
                }
            }

            else if (item.status === STATUS_OPTIMIZING) {
                this.statusLabel = "Optimizing images";
            }

            else if (item.status === STATUS_READY) {
                var folderName =  item.destination.substring("fs://localhost".length);
                folderName = folderName.substring(folderName.lastIndexOf("/") + 1);
                this.statusLabel = "Your book \"" + folderName + "\" is ready!";
            }

            this.needsDraw = true;
        }
    },

    handlePress: {
        value: function (evt) {
//            this.dispatchEventNamed("openDocument", true, true, {
//                url: this.historyItem.url
//            });
        }
    },

    draw: {
        value: function() {
            var item = this.item,
                className = "Activity-hide";

            if (item.status === STATUS_READY) {
                this.element.classList.add("Activity-ready");
                console.log("READY STATE:", this.openButton.element.classList)
//                this.progress.element.classList.add(className);
//                this.openButton.element.classList.remove(className);
//                this.closeButton.element.classList.add(className);
            } else {
                this.element.classList.remove("Activity-ready");
//                this.progress.element.classList.remove(className);
//                this.openButton.element.classList.add(className);
//                this.closeButton.element.classList.remove(className);
            }
        }
    }

});
