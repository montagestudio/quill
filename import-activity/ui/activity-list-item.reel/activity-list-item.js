var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component;

exports.ActivityListItem = Montage.create(Component, {

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

            if (this.item.status === 0) {
                this.statusLabel = "Waiting..."
            }

            else if (this.item.status === 1) {
                if (this.item.currentPage > 0 && this.item.nbrPages > 0) {
                    this.statusLabel = "Importing page " + this.item.currentPage + " of " + this.item.nbrPages;
                } else {
                    this.statusLabel = "Importing..."
                }
            }

            else if (this.item.status === 2) {
                this.statusLabel = "Ready!"
            }
        }
    },

    handlePress: {
        value: function (evt) {
//            this.dispatchEventNamed("openDocument", true, true, {
//                url: this.historyItem.url
//            });
        }
    }

});
