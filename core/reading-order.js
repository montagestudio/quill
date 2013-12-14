var Montage = require("montage").Montage,
    Promise = require("montage/core/promise").Promise;

/**
 * This controls the reading order feature of an ebook page.
 */

exports.ReadingOrder = Montage.specialize({

    constructor: {
        value: function ReadingOrder() {
            return this.super();
        }
    },

    _pageNumber: {
        value: null
    },

    contents: {
        value: null
    },

    text: {
        get: function() {
            var text = "No text detected on this page.";
            if (this.contents) {
                text = this.contents.map(function(item) {
                    return item.text;
                }).join(":::");
            }
            return text;
        },
        set: function(value) {
            console.log("Cant set text of the reading order..." + value);
        }
    }

});