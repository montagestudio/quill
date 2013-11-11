var PageDocument = require("core/page-document").PageDocument,
    Promise = require("montage/core/promise").Promise,
    WAITSFOR_TIMEOUT = 2500;

var connectDocumentToWindow = function (doc, aWindow) {
    var deferredDocumentConnection = Promise.defer();

    doc.addPathChangeListener("_channelReady", function (ready) {
        if (ready) {
            deferredDocumentConnection.resolve(doc);
        }
    });

    doc.pageWindow = aWindow;

    return deferredDocumentConnection.promise;
};

describe("core/page-document-spec", function () {

    var pageDocument,
        mockWindow,
        mockResponses;
    
    beforeEach(function () {
        pageDocument = new PageDocument();

        mockResponses = {
            hasCopyright: {result: false, success: true},
            copyrightPosition: {result: null, success: true}
        };
        mockWindow = {
            remotePort: null,
            postMessage: function(message, origin, transfer) {
                if (transfer && transfer.length > 0) {
                    this.remotePort = transfer[0];

                    var self = this;
                    this.remotePort.onmessage = function (message) {
                        self.handleChannelMessage(message);
                    };

                    this.remotePort.postMessage("ready");
                }
            },
            handleChannelMessage: function (message) {
                var methodName = message.data.method,
                    response = mockResponses[methodName],
                    responseMessage = {
                        method: methodName,
                        result: response.result,
                        success: !!response.success,
                        identifier: message.data.identifier
                    };

                this.remotePort.postMessage(responseMessage);
            }
        };
    });

    describe("initialization", function() {
        
        it("should have no pageWindow by default", function () {
            expect(pageDocument.pageWindow).toBeNull();
        });

        it("should open a message channel to the specified window", function() {
            pageDocument.pageWindow = mockWindow;
            expect(mockWindow.remotePort).toBeTruthy();
        });
        
    });

    describe("with an open channel", function () {

        var connectedDocumentPromise;

        describe("the copyright position API", function () {

            var newPosition;

            beforeEach(function () {
                newPosition = "bottom";

                mockResponses.hasCopyright = {result: true, success: true};
                mockResponses.copyrightPosition = {result: "top", success: true};
                mockResponses.setCopyrightPosition = {result: newPosition, success: true};
                connectedDocumentPromise = connectDocumentToWindow(pageDocument, mockWindow);
            });

            describe("via the optimistic property", function () {
                it ("should immediately set the specified value", function () {
                    return connectedDocumentPromise.then(function () {
                        pageDocument.copyrightPosition = newPosition;
                        expect(pageDocument.copyrightPosition).toBe(newPosition);
                    }).timeout(WAITSFOR_TIMEOUT);
                });

                it("should eventually update with the latest value", function () {
                    return connectedDocumentPromise.then(function () {
                        var deferredUpdateFromChannel = Promise.defer();

                        spyOn(mockWindow, "handleChannelMessage").andCallFake(function(message) {
                            expect(message.data.method).toBe("copyrightPosition");

                            // Plant a response that the agent knows a new value
                            var responseMessage = {
                                method: message.data.method,
                                result: newPosition,
                                success: true,
                                identifier: message.data.identifier
                            };

                            spyOn(pageDocument, "handleAgentMessage").andCallFake(function(message) {
                                var deferredResult = this._deferredMap.get(message.data.identifier);

                                deferredResult.promise.then(function (success) {
                                    // Test is done when the page has received the actual value
                                    deferredUpdateFromChannel.resolve();
                                });

                                return this.handleAgentMessage.originalValue.call(this, message);
                            });

                            mockWindow.remotePort.postMessage(responseMessage);
                        });

                        expect(pageDocument.copyrightPosition).toBe(pageDocument._copyrightPosition);

                        return deferredUpdateFromChannel.promise.then(function () {
                            expect(pageDocument._copyrightPosition).toBe(newPosition);
                        });

                    }).timeout(WAITSFOR_TIMEOUT);
                });

                it("should submit the specified value to the quill agent for applying", function () {
                    return connectedDocumentPromise.then(function () {
                        var deferredSetPosition = Promise.defer();

                        spyOn(mockWindow, "handleChannelMessage").andCallFake(function(message) {
                            expect(message.data.method).toBe("setCopyrightPosition");
                            deferredSetPosition.resolve();
                        });

                        pageDocument.copyrightPosition = newPosition;

                        return deferredSetPosition.promise;
                    }).timeout(WAITSFOR_TIMEOUT);
                });

                //TODO we should actually update with whatever the quill agent tells us we should upon rejection
                it("must be updated with the original value if the quill agent rejects the change", function () {
                    return connectedDocumentPromise.then(function () {
                        mockResponses.setCopyrightPosition = {result: null, success: false};
                        var deferredSetPosition = Promise.defer();

                        // prep document without accessing channel; original is "top," as the backend would answer
                        var originalPosition = pageDocument._copyrightPosition = mockResponses.copyrightPosition.result;

                        spyOn(pageDocument, "handleAgentMessage").andCallFake(function(message) {

                            var deferredResult = this._deferredMap.get(message.data.identifier);

        //                    debugger
                            if (deferredResult) {
                                deferredResult.promise.fail(function (error) {
                                    //Original internal promise rejected, test is done; verify rollback
                                    deferredSetPosition.resolve();
                                });
                            }

                            return this.handleAgentMessage.originalValue.call(this, message);
                        });

                        pageDocument.copyrightPosition = newPosition;
                        expect(pageDocument._copyrightPosition).toBe(newPosition);

                        return deferredSetPosition.promise.then(function () {
                            expect(pageDocument._copyrightPosition).toBe(originalPosition);
                        });
                    }).timeout(WAITSFOR_TIMEOUT);
                });

            });

        });

        describe("the copyright presence API", function () {

            beforeEach(function () {
                connectedDocumentPromise = connectDocumentToWindow(pageDocument, mockWindow);
            });

            describe("via the optimistic property", function () {

                it("should eventually update with the latest value", function () {
                    return connectedDocumentPromise.then(function () {
                        mockResponses.hasCopyright = {result: false, success: true};
                        var deferredUpdateFromChannel = Promise.defer();

                        spyOn(mockWindow, "handleChannelMessage").andCallFake(function(message) {
                            expect(message.data.method).toBe("hasCopyright");

                            // Plant a response that the agent knows a new value
                            var responseMessage = {
                                method: message.data.method,
                                result: true,
                                success: true,
                                identifier: message.data.identifier
                            };

                            spyOn(pageDocument, "handleAgentMessage").andCallFake(function(message) {
                                var deferredResult = this._deferredMap.get(message.data.identifier);

                                deferredResult.promise.then(function (success) {
                                    // Test is done when the page has received the actual value
                                    deferredUpdateFromChannel.resolve();
                                });

                                return this.handleAgentMessage.originalValue.call(this, message);
                            });

                            mockWindow.remotePort.postMessage(responseMessage);
                        });

                        expect(pageDocument.hasCopyright).toBe(pageDocument._hasCopyright);

                        return deferredUpdateFromChannel.promise.then(function () {
                            expect(pageDocument._hasCopyright).toBe(true);
                        });
                    }).timeout(WAITSFOR_TIMEOUT);
                });

            });

        });

        describe("the document API", function () {

            var documentContent;

            beforeEach(function () {
                documentContent = '<html><head><title>Foo</title></head><body>Bar</body></html>';
                connectedDocumentPromise = connectDocumentToWindow(pageDocument, mockWindow);
            });

            describe("via the optimistic property", function () {

                it("should eventually update with the latest value", function () {
                    return connectedDocumentPromise.then(function () {
                        mockResponses.documentContent = {result: documentContent, success: true};
                        var deferredUpdateFromChannel = Promise.defer();

                        spyOn(mockWindow, "handleChannelMessage").andCallFake(function(message) {
                            expect(message.data.method).toBe("documentContent");

                            // Plant a response that the agent knows a new value
                            var responseMessage = {
                                method: message.data.method,
                                result: '<html><head><title>Baz</title></head><body>Quz</body></html>',
                                success: true,
                                identifier: message.data.identifier
                            };

                            spyOn(pageDocument, "handleAgentMessage").andCallFake(function(message) {
                                var deferredResult = this._deferredMap.get(message.data.identifier);

                                deferredResult.promise.then(function (success) {
                                    // Test is done when the page has received the actual value
                                    deferredUpdateFromChannel.resolve();
                                });

                                return this.handleAgentMessage.originalValue.call(this, message);
                            });

                            mockWindow.remotePort.postMessage(responseMessage);
                        });

                        expect(pageDocument.document).toBeNull();

                        return deferredUpdateFromChannel.promise.then(function () {
                            expect(pageDocument._document).toBeTruthy();
                        });
                    }).timeout(WAITSFOR_TIMEOUT);
                });

            });

        });

    });

});
