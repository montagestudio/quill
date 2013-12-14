var Montage = require("montage").Montage,
    Promise = require("montage/core/promise").Promise,
    ReadingOrder = require("core/reading-order").ReadingOrder;

/**
 * This controls the read aloud feature of an ebook page.
 */

var WAV_EXTENSION = ".wav",
    MP3_EXTENSION = ".mp3";

exports.ReadAlong = Montage.specialize({

    constructor: {
        value: function ReadAlong() {

            this.readingOrder = new ReadingOrder();

            return this.super();
        }
    },

    _pageNumber: {
        value: null
    },

    _basePath: {
        value: null
    },

    basePath: {
        get: function() {
            return this._basePath;
        },
        set: function(value) {
            if (value && value !== this._basePath) {
                this._basePath = value;
            }
        }
    },
    /**
     * The URL of the document that houses the content for this page
     */
    _xhtmlUrl: {
        value: null
    },
    xhtmlUrl: {
        get: function() {
            return this._xhtmlUrl;
        },
        set: function(value) {
            if (value && value !== this._xhtmlUrl) {
                this._xhtmlUrl = value;
            }
        }
    },

    /**
     * The URL or the voice only audio for this page, used for alignment
     */

    voiceAudio: {
        value: null
    },

    _voiceAudioUrl: {
        value: null
    },

    voiceAudioUrl: {
        get: function() {
            return this._voiceAudioUrl;
        },
        set: function(value) {
            var url = this._voiceAudioUrl;

            if (!url && this._basePath && this._pageNumber) {
                url = this._basePath + "/audio/../voice/" + this._pageNumber + WAV_EXTENSION;
            }

            return url;
        }
    },

    /**
     * The URL of the final audio which contains music, foley effects and voice for this page, packaged with the final book
     */

    finalAudio: {
        value: null
    },

    _finalAudioUrl: {
        value: null
    },

    finalAudioUrl: {
        get: function() {
            var url = this._finalAudioUrl;

            if (!url && this._basePath && this._pageNumber) {
                url = this._basePath + "/audio/" + this._pageNumber + MP3_EXTENSION;
            }

            return url;
        },
        set: function(value) {
            if (value && value !== this._finalAudioUrl) {
                this._finalAudioUrl = value;
            }
        }
    },

    pageDocument: {
        value: null
    },

    _hasReadAlong: {
        value: false
    },

    hasReadAlong: {
        get: function() {
            var self = this;
            var resultDone = this.getHasReadAlong()
            // .then(function(result){
            //     console.log("resultDone " + result);
            //     self._hasReadAlong = result;
            //      if the page has read along, then lets load the reading order 
            //     if(result === true){
            //         self.getReadingOrderFromXHTML();
            //     }
            // })
            .done();
            return this._hasReadAlong;
        }
    },

    getHasReadAlong: {
        value: function() {
            return this.pageDocument._getChannelProperty("hasReadAlong", "hasReadAlong", "_hasReadAlongChannelRider");
        }
    },

    _readingOrderFromXHTML: {
        value: null
    },

    readingOrderFromXHTML: {
        get: function() {
            var self = this;
            this.getReadingOrderFromXHTML().then(function(result){
                console.log("resultDone " + result);
                self._readingOrderFromXHTML = result;
                self.readingOrder.contents = result;
            }).done();
            return this._readingOrderFromXHTML;
        }
    },

    getReadingOrderFromXHTML: {
        value: function() {
            return this.pageDocument._getChannelProperty("readingOrderFromXHTML", "readingOrderFromXHTML", "_readingOrderFromXHTMLChannelRider");
        }
    },

    alignAudioAndText: {
        value: function() {
            console.log("Aligning");
        }
    },

    _alignmentConfidence: {
        value: null
    },

    alignmentConfidence: {
        get: function() {
            if (!this._hasReadAlong) {
                return null;
            }
            //TODO measure confidence in alignment
            return 100;
        }
    },

    /*
    Holder array for aligner's results. 
     */
    alignmentResults: {
        value: null
    },

    load: {
        value: function() {
            console.log("loading prevous read along details");
            return new Promise();
        }
    },

    save: {
        value: function() {
            if (!this.alignmentResults) {
                return;
            }
            console.log("saving prevous read along details" + JSON.stringify(this.alignmentResults));
            return new Promise();
        }
    }

});