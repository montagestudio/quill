var Montage = require("montage").Montage;

/**
 * This represents a single physical page in an ebook.
 *
 * This is not final code and on it's own should be considered a
 * step towards formalizing a document structure for this
 * application and the content it handles. Eventually,
 * it should probably adopt the palette document base.
 */

var PAGE_TYPE = "page";

exports.PageDocument = Montage.specialize({

    constructor: {
        value: function PageDocument () {
            return this.super();
        }
    },

    /**
     * Apparently this is the page number for right now
     */
    name: {
        value: null
    },

    /**
     * The URL of the document that houses the content for this page
     */
    url: {
        value: null
    },

    type: {
        value: PAGE_TYPE
    },

    width: {
        value: null
    },

    height: {
        value: null
    },

    _text:{
        value: null
    },

    text: {
        get: function() {
            return this._text || "(This page has no text)";
        },
        set: function(text) {
            this._text = text;
        }
    }

});
