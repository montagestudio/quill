var PageDocument = require("core/page-document").PageDocument,
    Promise = require("montage/core/promise").Promise,
    ReadAlong = require("core/read-along").ReadAlong,
    Q = require("q"),
    WAITSFOR_TIMEOUT = 5500;

describe("core/read-along-spec", function() {

    describe("reading order visualization", function() {

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

    describe("channel to epub book page's iframe", function() {

        var readAlong;

        describe("the reading order API", function() {

            beforeEach(function() {
                readAlong = new ReadAlong();
                readAlong.xhtmlUrl = "test/read-along/test-book-page.html";
                readAlong.connect();
            });


            it("should send messages", function() {
                readAlong.channel.l2r.put(10);
                readAlong.channel.r2l.put(20);

                var a = readAlong.channel.l2r.get().then(function(value) {
                    console.log(value);
                    expect(value).toBe(20);
                });
                var b = readAlong.channel.r2l.get().then(function(value) {
                    console.log(value);
                    expect(value).toBe(10);
                });
                Q.all([a, b]);
            });


            it("should trigger local progress handler", function() {
                var notifyCount = 0;
                return readAlong.peers.remote.invoke('runSomethingWithProgressNotifications', 3).progress(function(p) {
                    notifyCount++;
                    console.log(notifyCount);
                }).then(function(message) {
                    console.log(message);
                    console.log(notifyCount);
                    expect(notifyCount).toBe(3);
                });
            });

            it("should reject all pending promises on lost connection", function() {
                readAlong.peers.close();
                return readAlong.peers.remote.invoke("respond").then(function() {
                    console.log("This shouldnt happen");
                    expect(false).toBe(true);
                }, function(reason) {
                    console.log("Promise on closed connection was rejected ", reason.message);
                    expect(reason.message).toBe("Can't resolve promise because Connection closed");
                });
            });

            it("should eventually update hasReadAlong with the latest value", function() {

                return readAlong.peers.remote.invoke("hasReadAlong")
                    .then(function(result) {
                        console.log(result);
                        expect(result).toBe(true);
                    });
            });


            it("should eventually update readingOrderFromXHTML with the latest value", function() {

                return readAlong.peers.remote.invoke("getReadingOrderFromXHTML")
                    .then(function(result) {
                        console.log(result);
                        expect(result).toEqual([{
                            "id": "w1",
                            "text": "Hello"
                        }, {
                            "id": "w2",
                            "text": "I'm"
                        }, {
                            "id": "w4",
                            "text": "Emily"
                        }, {
                            "id": "w5",
                            "text": "Elizabeth!"
                        }]);
                    });
            });

        });

    });
});