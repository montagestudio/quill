var Montage = require("montage").Montage,
    Promise = require("montage/core/promise").Promise,
    Map = require("montage/collections/map"),
    UUID = require("montage/core/uuid");

/**
 * This represents a single physical page in an ebook.
 *
 * This is not final code and on it's own should be considered a
 * step towards formalizing a document structure for this
 * application and the content it handles. Eventually,
 * it should probably adopt the palette document base.
 */

var PAGE_TYPE = "page";
var INJECTED_CLASS_NAME = "quill-injected";

var PageDocument = exports.PageDocument = Montage.specialize({

    constructor: {
        value: function PageDocument () {
            this._deferredMap = new Map();
            this._operationQueue = [];
            return this.super();
        }
    },

    /**
     * This is a map of deferreds keyed by name, typically the name of
     * method that vended the deferred in the first place.
     *
     * This is a somewhat temporary thing that I'm sure is doing the
     * same work as q-connection to make sure that invoking methods
     * over a message channel maps back to the correct deferred.
     *
     * This facility also ensures that subsequent requests for the
     * same information doesn't result in yet more traffic in the channel;
     * if there is a deferred pending, that promise is returned.
     */
    _deferredMap: {
        value: null
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
    _url: {
        value: null
    },
    url: {
        get: function() {
            return this._url;
        },
        set: function(value) {
            if (value) {
                // inspired by http://james.padolsey.com/javascript/parsing-urls-with-the-dom/
                var a =  document.createElement('a');
                a.href = value;

                if (!a.search) {
                    a.search = "?";
                } else {
                    a.search += "&";
                }

                // Insert the script tags needed to communicate with the page
                var search = Object.map(PageDocument.URL_PARAMS, function (value, key) {
                    return encodeURIComponent(key) + "=" + encodeURIComponent(value);
                }).join("&");

                a.search += search;

                this._url = a.href;
            } else {
                this._url = value;
            }
        }
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
     *
     * TODO Eventually this transport should be consolidated and moved elsewhere;
     * the pageDocument should be unaware of the need for this channel, but it's
     * convenient here to start
     */
    _agentPort: {
        value: null
    },

    _operationQueue: {
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
            return this._pageWindow;
        },
        set: function (value) {
            if (value === this._pageWindow) {
                return;
            }

            this._pageWindow = value;

            if (value) {
                this.connect();
            } else {
                this.disconnect();
            }
        }
    },

    _channelReady: {
        value: false
    },

    // We need to reconnect when
    // we get a new pageWindow we didn't know of before
    // we get back the same pagewindow
    connect: {
        value: function () {
            if (!this._pageWindow) {
                //TODO do something better?
                return;
            }

            var channel = new MessageChannel();
            this._agentPort = channel.port1;

            //Note complexity so we can spy on/replace handleAgentMessage in testing
            channel.port1.onmessage = (function (self) {
                return function () {
                    self.handleAgentMessage.apply(self, arguments);
                }
            })(this);

            this._channelReady = false;
            this._pageWindow.postMessage("openChannel", "fs://localhost", [channel.port2]);
        }
    },

    //TODO improve queue management; it's probably very brittle as implemented
    _sendQueuedMessages: {
        value: function() {
            var self = this;
            this._operationQueue.forEach(function (message) {
                console.log("PERFORM QUEUED:", message);
                self._agentPort.postMessage(message);
            });
            this._operationQueue.clear();
        }
    },

    disconnect: {
        value: function () {
            if (this._agentPort) {
                this._channelReady = false;
                this._agentPort.close();
                this._agentPort = null;
            }
        }
    },

    /**
     * Receive messages from the agent to which we've sent remote commands
     * and match them back to the promises we vended for each one, resolving
     * or rejecting as possible.
     *
     * Resolved promises stay in memory until they are considered stale
     * and are manually removed, for now.
     */
    handleAgentMessage: {
        value: function (evt) {
            var data = evt.data,
                deferredIdentifier = data.identifier,
                deferredResult;

            console.log("parent" + this.name + ": onmessage", data);

            if ("disconnect" === data) {
                this.pageWindow = null;
            } else if ("ready" === data) {
                this._channelReady = true;

                //TODO opportunity to clean this up; it sends multiple messages unnecessarily
                this.refresh();
                this._sendQueuedMessages();
            } else if (deferredIdentifier) {
                deferredResult = this._deferredMap.get(deferredIdentifier);

                if (deferredResult) {

                    if (data.success) {
                        deferredResult.resolve(data.result);
                    } else {
                        deferredResult.reject(new Error("Failed remote method:" + data.method));
                    }

                } else {
                    throw new Error("Received message resolving unexpected operation");
                    //TODO this might be an unexpected message from the server due to a change
                    // on its end, handle it
                }
            }
        }
    },

    /**
     * Sets the value of the internal property while dispatching a change on
     * the public property
     */
    _applyChange: {
        value: function (propertyName, privatePropertyName, value) {
            this.dispatchBeforeOwnPropertyChange(propertyName, this[privatePropertyName]);
            this[privatePropertyName] = value;
            this.dispatchOwnPropertyChange(propertyName, this[privatePropertyName]);
        }
    },

    // TODO this should probably ensure some order; Q-connection might do that already
    // I'm probably reinventing some wheel here
    // TODO normalize parameters amongst all remoteOperation methods
    /**
     * Invokes the specified remote method, expecting a response back
     * on the specified deferred object.
     */
    _performChannelOperation: {
        value: function(deferredIdentifier, remoteMethodName, args) {

            var deferredResult = Promise.defer();
            this._deferredMap.set(deferredIdentifier, deferredResult);

            var message = {identifier: deferredIdentifier, method: remoteMethodName};
            if (args) {
                message.args = args;
            }

            if (this._agentPort && this._channelReady) {
                this._agentPort.postMessage(message);
            } else {
                //TODO improve this whole queueing when there's no connection open
                console.log("QUEUE!", message);
                this._operationQueue.push(message);
            }

            return deferredResult.promise;
        }
    },

    /**
     * Invokes a method call on the remote server, expecting a single deferred
     * as a promise for the response for identical invocations.
     *
     * Calling this multiple times with the same values will result in a single
     * operation and a single deferred, until that deferred is considered stale.
     */
    //TODO when do we consider them stale? where is that tracked?
    //TODO improve the name, imply: idempotency, reading, accessing, cacheable
    _getChannelProperty: {
        value: function (property, remoteMethodName, internalProperty, deferredIdentifier) {
            deferredIdentifier = deferredIdentifier || property;

            var outstandingDeferred = this._deferredMap.get(deferredIdentifier),
                promisedResult,
                self = this;

            if (!outstandingDeferred) {
                promisedResult = this._performChannelOperation(deferredIdentifier, remoteMethodName);

                if (property && internalProperty) {
                    promisedResult = promisedResult.then(function (result) {
                        console.log("get success", property, result);
                        self._applyChange(property, internalProperty, result);
                        return result;
                    });
                }
            } else {
                promisedResult = outstandingDeferred.promise;
            }

            return promisedResult;
        }
    },

    /**
     * Invokes a method call on the remote server, expecting a unique deferred
     * as a promise for the response for each invocation.
     *
     * Calling this multiple times with the same values will result in multiple
     * operations and multiple deferreds.
     */
    //TODO improve the name, imply: potency, payload, arguments, urgency, writing
    _setChannelProperty: {
        value: function (property, value, remoteMethodName, internalProperty) {
            var deferredIdentifier = UUID.generate(),
                restoreValue = this[internalProperty],
                self = this;

            return this._performChannelOperation(deferredIdentifier, remoteMethodName, [value]).then(
                function (success) {

                    //TODO detect success vs failure (the failure handler deals with errors)

                    //TODO accept accepted value, instead of value
                    console.log("set success", property, value);

                    //TODO how do we know what values are affected by this property?
                    //i.e. which cached deferreds to clear?
                    //e.g. document should cleared when copyrightPosition is changed
                    //TODO just listen for a change on the properties we care about and delete the deferredMap entry manually?

                    //if there's no deferred for remoteMethodName or the current one is stale
                    var deferredRead = self._deferredMap.get(property);
                    if (!deferredRead || deferredRead.promise.isFulfilled()) {
                        // set a deferred for remoteMethodName to prevent unnecessary chatter
                        // requests for a moment; we know the latest value we just set
                        deferredRead = Promise.defer();
                        deferredRead.resolve(value);
                        self._deferredMap.set(property, deferredRead);
                    }

                    if (self[internalProperty]!== value) {
                        self._applyChange(property, internalProperty, value);
                    }
                },
                function (failure) {
                    //TODO it would be nice if the restore value came from the server too
                    console.log("set error  ", property, restoreValue);
                    self._applyChange(property, internalProperty, restoreValue);
                }).fin(function () {
                    self._deferredMap.delete(deferredIdentifier);
                });
        }
    },

    _hasCopyright: {
        value: false
    },

    hasCopyright: {
        get: function () {
            this.getHasCopyright().done();
            return this._hasCopyright;
        }
    },

    getHasCopyright: {
        value: function () {
            return this._getChannelProperty("hasCopyright", "hasCopyright", "_hasCopyright");
        }
    },

    /**
     * Internal eventually consistent copyrightPosition
     */
    _copyrightPosition: {
        value: null
    },

    /**
     * Eventually consistent property accessor, primarily for bindings
     * Optimistically assumes that changes are accepted
     */
    copyrightPosition: {
        get: function () {
            this.getCopyrightPosition().done();
            return this._copyrightPosition;
        },
        set: function (value) {
            if (value === this._copyrightPosition) {
                return;
            }

            this.setCopyrightPosition(value).done();
            this._copyrightPosition = value;
        }
    },

    /**
     * Setting of copyrightPosition
     */
    setCopyrightPosition: {
        value: function (value) {
            return this._setChannelProperty("copyrightPosition", value, "setCopyrightPosition", "_copyrightPosition");
        }
    },

    /**
     * Getting of copyrightPosition, results to be returned as a promise
     */
    getCopyrightPosition: {
        value: function () {
           return this._getChannelProperty("copyrightPosition", "copyrightPosition", "_copyrightPosition");
        }
    },

    _document: {
        value: null
    },

    document: {
        get: function () {
            this.getDocument().done();
            return this._document;
        }
    },

    getDocument: {
        value: function () {
            var self = this;

            return this._getChannelProperty("document", "documentContent").then(function (content) {
                var pageDom = (new DOMParser()).parseFromString(content, "text/xml");
                var injectedNodes = pageDom.getElementsByClassName(INJECTED_CLASS_NAME);

                //TODO have a better way to identify injected content and remove it
                if (injectedNodes.length > 0) {
                    var injectedRange = pageDom.createRange();
                    injectedRange.setStartBefore(injectedNodes[0]);
                    injectedRange.setEndAfter(injectedNodes[injectedNodes.length - 1]);
                    injectedRange.deleteContents();
                }

                self._applyChange("document", "_document", pageDom);

                //TODO not do this manually here; requesting the document should be cleared
                // when any number of properties that affect it have changed;
                //TODO who knows which properties that may be? (i.e. which side of the connection)
                self._deferredMap.delete("documentContent");

                return pageDom;
            });
        }
    },

    /**
     * Clear out cached values from the remote and refresh them
     * with the latest best values
     */
    refresh: {
        value: function () {
            var cachedDeferredKeys = this._deferredMap.keys(),
                self = this;

            cachedDeferredKeys.forEach(function (identifier) {
                self._deferredMap.delete(identifier);
                //TODO this is a bit fragile, may not be worth doing
                self[identifier];
            });
        }
    }

}, {
    URL_PARAMS: {
        value: {
            find: "<head>",
            insert: '<script class="' + INJECTED_CLASS_NAME + '" src="http://client/quill-agent/quill-agent.js" /><script class="' + INJECTED_CLASS_NAME + '" src="http://client/quill-agent/html-controller.js" />'
        }
    }
});
