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

    /**
     * The MessagePort to use to communicate with the embedded
     * QuillAgent
     */
    agentPort: {
        value: null
    },

    /**
     * The window that is currently presenting this page,
     * the actual DOM for this page is live inside this window.
     *
     * When this is known, a QuillAgent is sitting inside that window
     * awaiting commands.
     */
    _pageWindow: {
        value: null
    },

    pageWindow: {
        get: function () {
            return this._pageWindow
        },
        set: function (value) {
            if (this.agentPort) {
                this.agentPort.close();
            }
            if (value) {
                var channel = new MessageChannel();
                this.agentPort = channel.port1;
                channel.port1.onmessage = this.handleAgentMessage.bind(this);
                value.postMessage("openChannel", "fs://localhost", [channel.port2]);
                this.agentPort.postMessage({"method": "hasCopyright"});
                this.agentPort.postMessage({"method": "copyrightPosition"});
            }

            if (value !== this._pageWindow) {
                this._pageWindow = value;
            }
        }
    },

    handleAgentMessage: {
        value: function (evt) {
            console.log("parent: onmessage", evt.data);

            if ("hasCopyright" === evt.data.method) {
                this.hasCopyright = evt.data.result;
            } else if ("copyrightPosition" === evt.data.method) {
                this.copyrightPosition = evt.data.result;
            } else if ("documentContent" === evt.data.method) {
                alert("Document content presented in console…");
                console.log(evt.data.result);
            }
        }
    },

    hasCopyright: {
        value: false
    },

    _copyrightPosition: {
        value: null
    },

    copyrightPosition: {
        get: function () {
            return this._copyrightPosition;
        },
        set: function (value) {
            if (value === this._copyrightPosition) {
                return;
            }

            if (this.agentPort && null !== this._copyrightPosition) {
                this.agentPort.postMessage({"method": "setCopyrightPosition", "args": [value]});
            }

            this._copyrightPosition = value;
        }
    },

    save: {
        value: function () {
            if (this.agentPort) {
                this.agentPort.postMessage({"method": "documentContent"});
                //TODO well, do something with this when we get the content
            }
        }
    }

});
