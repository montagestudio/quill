var Montage = require("montage").Montage,
    Promise = require("montage/core/promise").Promise,
    ReadingOrder = require("core/reading-order").ReadingOrder,
    Q = require("q"),
    Queue = require("q/queue"),
    Connection = require("q-connection");

/**
 * This controls the read aloud feature of an ebook page.
 */

var WAV_EXTENSION = ".wav",
    MP3_EXTENSION = ".mp3";


/**
 * https://github.com/kriskowal/q-connection/blob/master/spec/q-connection-spec.js
 */


exports.ReadAlong = Montage.specialize({

    constructor: {
        value: function ReadAlong() {

            this.useWorkaroundForCORSErrorWhenConnectingToIframe = true;

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
    },

    channel: {
        value: null
    },

    peers: {
        value: null
    },

    hasReadAlong: {
        value: null
    },

    connect: {
        value: function() {

            /**
             * https://github.com/kriskowal/q-connection/blob/master/spec/q-connection-spec.js
             */
            var sending = Queue();
            var receiving = Queue();

            var channel = {
                l2r: {
                    get: sending.get,
                    put: receiving.put,
                    close: sending.close,
                    closed: sending.closed
                },
                r2l: {
                    get: receiving.get,
                    put: sending.put,
                    close: receiving.close,
                    closed: receiving.closed
                },
                close: function() {
                    sending.close();
                    receiving.close();
                }
            };

            // To communicate with a single frame on the same origin
            // (multiple frames will require some handshaking event sources)

            var iframe,
                local;

            var iFrames = document.getElementsByTagName("iframe");
            for (var frame = 0; frame < iFrames.length; frame++) {
                if (iFrames[frame].src.indexOf(this.xhtmlUrl) > -1) {
                    console.log(iFrames[frame]);
                    iframe = iFrames[frame];
                }
            }
            if (!iframe) {
                console.log("No connection to the iframe.");
                return;
            }

            /* workaround for Uncaught SecurityError: Blocked a frame with origin "http://client" from accessing a frame with origin "fs://localhost".  The frame requesting access has a protocol of "http", the frame being accessed has a protocol of "fs". Protocols must match.
             */
            try {
                local = iframe.contentWindow.agent.htmlController.sharedReadingOrderMethods;
            } catch (e) {
                console.log("Cant connect to the iframe. " + e);
                local = {};
            }

            this.channel = channel;
            this.peers = {
                local: Connection(channel.l2r, local),
                remote: Connection(channel.r2l, local, {
                    origin: window.location.origin,
                    Q: Q
                }),
                close: channel.close
            };


            var self = this;
            if (!this.useWorkaroundForCORSErrorWhenConnectingToIframe) {
                this.peers.remote.invoke("hasReadAlong").then(function() {
                    self.hasReadAlong = result;
                });
                this.peers.remote.invoke("getReadingOrderFromXHTML").then(function() {
                    self.this.readingOrder.contents = result;
                });
            } else {
                srcUri = iframe.src.replace("http://client/index.html?file=", "");
                this.readingOrder.loadFromXHTML(srcUri);
                this.hasReadAlong = this.readingOrder.text !== "No text detected on this page.";
            }
        }
    }

});