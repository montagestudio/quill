var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    IMPORT_STATES = require("core/importStates").importStates;    


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

    error: {
        get: function() {
            return this.item.error
        },

        set: function(value) {
            this.setStatusLabel();
        }
    },

    setStatusLabel: {
        value: function() {
            // JFD TODO: L10n

            var item = this.item;

            if (item.status === IMPORT_STATES.unknown || item.status === IMPORT_STATES.waiting) {
                this.statusLabel = "Waiting..."
            }

            else if (item.status === IMPORT_STATES.fetching) {
                this.statusLabel = "Fetching description...";
            }

            else if (item.status === IMPORT_STATES.fetchError) {
                this.statusLabel = "Fetching description failed, will try again later...";
            }

            else if (item.status === IMPORT_STATES.converting || item.status == IMPORT_STATES.stalled) {
                if (item.currentPage > 0 && item.nbrPages > 0) {
                    this.statusLabel = "Importing page " + item.currentPage + " of " + item.nbrPages;
                } else {
                    this.statusLabel = "Importing..."
                }

                if (item.status == IMPORT_STATES.stalled) {
                    this.statusLabel += " (stalled)";
                }
            }

            else if (item.status === IMPORT_STATES.optimizing) {
                this.statusLabel = "Optimizing images";
            }

            else if (item.status === IMPORT_STATES.error) {
                this.statusLabel = "Error: " + item.error;
            }

            else if (item.status === IMPORT_STATES.ready) {
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
                coverImage = item.coverImage;

            if (item.status === IMPORT_STATES.ready) {
                this.element.classList.add("Activity-ready");

                if (item.coverImage) {
                    var icon = this.element.getElementsByClassName("Activity-item--icon");
                    if (icon && icon.length) {
                        icon[0].style.backgroundImage = "url('" + coverImage + "')";
                        icon[0].style.backgroundPosition = "center center";
                    }
                }
            } else {
                this.element.classList.remove("Activity-ready");
                delete this.element.style.backgroundImage;
                delete this.element.style.backgroundPosition;
            }
        }
    }

});
