/*jshint maxcomplexity:12 */ // TODO: fix these warnings
var Component = require("montage/ui/component").Component,
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
            return this.item.status;
        },

        set: function(value) {
            this.setStatusLabel();
        }
    },

    currentPage: {
        get: function() {
            return this.item.currentPage;
        },

        set: function(value) {
            this.setStatusLabel();
        }
    },

    nbrPages: {
        get: function() {
            return this.item.nbrPages;
        },

        set: function(value) {
            this.setStatusLabel();
        }
    },

    error: {
        get: function() {
            return this.item.error;
        },

        set: function(value) {
            this.setStatusLabel();
        }
    },

    coverImage: {
        get: function() {
            return this.item.coverImage;
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
                this.statusLabel = "Waiting...";
            }

            else if (item.status === IMPORT_STATES.fetching) {
                this.statusLabel = "Fetching description...";
            }

            else if (item.status === IMPORT_STATES.fetchError) {
                this.statusLabel = "Fetching description failed, will try again...";
            }

            else if (item.status === IMPORT_STATES.converting || item.status === IMPORT_STATES.stalled) {
                if (item.currentPage > 0 && item.nbrPages > 0) {
                    this.statusLabel = "Importing page " + item.currentPage + " of " + item.nbrPages;
                } else {
                    this.statusLabel = "Importing...";
                }

                if (item.status === IMPORT_STATES.stalled) {
                    this.statusLabel += "...";
                }
            }

            else if (item.status === IMPORT_STATES.generatingAudioAlignment) {
                // if (item.currentPage > 0 && item.nbrPages > 0) {
                //     this.statusLabel = "Generating read aloud for page " + item.currentPage + " of " + item.nbrPages;
                // } else {
                //     this.statusLabel = "Generating read aloud...";
                // }
                this.statusLabel = "Generating read aloud...";
            }

            else if (item.status === IMPORT_STATES.optimizing) {
                this.statusLabel = "Optimizing images";
            }

            else if (item.status === IMPORT_STATES.generating) {
                this.statusLabel = "Generating book";
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
                coverImage = item.coverImage,
                iconElem = this.element.getElementsByClassName("Activity-item--icon"),
                clearBackgroundImage = true;

            iconElem = iconElem && iconElem.length ? iconElem[0] : null;

            if (item.status === IMPORT_STATES.ready) {
                this.element.classList.add("Activity-ready");

                if (item.coverImage) {
                    if (iconElem) {
                        iconElem.style.backgroundImage = "url('" + coverImage + "')";
                        iconElem.style.backgroundPosition = "center center";
                        clearBackgroundImage = false;
                    }
                }
            } else {
                this.element.classList.remove("Activity-ready");
            }

            if (clearBackgroundImage && iconElem) {
                iconElem.setAttribute("style", "");
            }
        }
    }

});
