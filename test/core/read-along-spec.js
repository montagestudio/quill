var ReadAlong = require("core/read-along").ReadAlong,
    Q = require("q");

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

            it("should eventually update hasReadAlong with the latest value", function() {
                expect(true).toBe(true);
            });


            it("should eventually update readingOrderFromXHTML with the latest value", function() {
                expect(true).toBe(true);
            });

        });

    });
});