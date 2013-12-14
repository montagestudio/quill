var PageDocument = require("core/page-document").PageDocument,
    Promise = require("montage/core/promise").Promise,
    WAITSFOR_TIMEOUT = 2500;

var connectDocumentToWindow = function(doc, aWindow) {
    var deferredDocumentConnection = Promise.defer();

    doc.addPathChangeListener("_channelReady", function(ready) {
        if (ready) {
            deferredDocumentConnection.resolve(doc);
        }
    });

    doc.pageWindow = aWindow;

    return deferredDocumentConnection.promise;
};

/*
TODO maybe fastest to run tests with a page doc, if not try with only the read along...
 */
describe("core/read-along-spec", function() {

    var pageDocument,
        mockWindow,
        mockResponses;

    beforeEach(function() {
        pageDocument = new PageDocument();

        mockResponses = {
            hasReadAlong: {
                result: false,
                success: true
            },
            copyrightPosition: {
                result: null,
                success: true
            }
        };
        mockWindow = {
            remotePort: null,
            postMessage: function(message, origin, transfer) {
                if (transfer && transfer.length > 0) {
                    this.remotePort = transfer[0];

                    var self = this;
                    this.remotePort.onmessage = function(message) {
                        self.handleChannelMessage(message);
                    };

                    this.remotePort.postMessage("ready");
                }
            },
            handleChannelMessage: function(message) {
                var methodName = message.data.method,
                    response = mockResponses[methodName],
                    responseMessage = {
                        method: methodName,
                        result: response.result,
                        success: !! response.success,
                        identifier: message.data.identifier
                    };

                this.remotePort.postMessage(responseMessage);
            }
        };
    });

    describe("initialization", function() {

        it("should have no pageWindow by default", function() {
            expect(pageDocument.pageWindow).toBeNull();
        });

        it("should open a message channel to the specified window", function() {
            pageDocument.pageWindow = mockWindow;
            expect(mockWindow.remotePort).toBeTruthy();
        });

    });


    describe("reading order", function() {

        it("should indicate reading order visually", function() {
            expect(true).toBe(true);
        });

        it("should maybe provide an easy mechanism to re-order divs", function() {
            expect(true).toBe(true);
        });

    });


    describe("align audio with text", function() {

        it("should attempt to discover alignment", function() {
            expect(true).toBe(true);
        });

        it("should be able to trigger alignment by user", function() {
            expect(true).toBe(true);
        });

    });



    describe("with an open channel", function() {

        var connectedDocumentPromise;


        describe("the read along presence API", function() {

            beforeEach(function() {
                connectedDocumentPromise = connectDocumentToWindow(pageDocument, mockWindow);
            });

            describe("via the optimistic property", function() {

                it("should eventually update with the latest value", function() {
                    return connectedDocumentPromise.then(function() {
                        mockResponses.hasReadAlong = {
                            result: false,
                            success: true
                        };
                        var deferredUpdateFromChannel = Promise.defer();

                        spyOn(mockWindow, "handleChannelMessage").andCallFake(function(message) {
                            expect(message.data.method).toBe("hasReadAlong");

                            // Plant a response that the agent knows a new value
                            var responseMessage = {
                                method: message.data.method,
                                result: true,
                                success: true,
                                identifier: message.data.identifier
                            };

                            spyOn(pageDocument, "handleAgentMessage").andCallFake(function(message) {
                                var deferredResult = this._deferredMap.get(message.data.identifier);

                                deferredResult.promise.then(function(success) {
                                    // Test is done when the page has received the actual value
                                    deferredUpdateFromChannel.resolve();
                                });

                                return this.handleAgentMessage.originalValue.call(this, message);
                            });

                            mockWindow.remotePort.postMessage(responseMessage);
                        });

                        expect(pageDocument.hasReadAlong).toBe(pageDocument._hasReadAlong);

                        return deferredUpdateFromChannel.promise.then(function() {
                            expect(pageDocument._hasReadAlong).toBe(true);
                        });
                    }).timeout(WAITSFOR_TIMEOUT);
                });

            });

        });


    });

});