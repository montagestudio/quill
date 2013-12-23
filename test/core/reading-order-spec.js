var ReadingOrder = require("core/reading-order").ReadingOrder,
    Q = require("q");

describe("core/reading-order-spec", function() {

    it("should extract reading order from xhtml", function() {
        var readingOrder = new ReadingOrder();
        expect(readingOrder).toBeDefined();
        return readingOrder.loadFromXHTML("test/read-along/test-book-page.html").then(function(results) {

            console.log("Recieved ", results);
            expect(results).toEqual([{
                "id": "w2",
                "text": "Rattle",
                "readingOrder": 1
            }, {
                "id": "w4",
                "text": "Rattle",
                "readingOrder": 2
            }, {
                "id": "w6",
                "text": "Clink",
                "readingOrder": 3
            }, {
                "id": "w9",
                "text": "Tip",
                "readingOrder": 4
            }, {
                "id": "w11",
                "text": "tap",
                "readingOrder": 5
            }, {
                "id": "w13",
                "text": "Purrrrrrrrrrrrrrrrrr",
                "readingOrder": 6
            }, {
                "id": "w15",
                "text": "Ka-plink",
                "readingOrder": 7
            }, {
                "id": "w17",
                "text": "ka-plink",
                "readingOrder": 8
            }, {
                "id": "w19",
                "text": "ka-plink",
                "readingOrder": 9
            }]);

            readingOrder.text.then(function(result) {
                console.log("recieved text" + result);
                expect(result).toEqual("Rattle:::Rattle:::Clink:::Tip:::tap:::Purrrrrrrrrrrrrrrrrr:::Ka-plink:::ka-plink:::ka-plink");
            });
        });

    });

    it("should extract reading order for the incorrect test", function() {
        var readingOrder = new ReadingOrder();
        expect(readingOrder).toBeDefined();
        return readingOrder.loadFromXHTML("test/read-along/test-book-page-incorrect-reading-order.html").then(function(results) {

            console.log("Recievd ", results);
            expect(results).toEqual([{
                "id": "w2",
                "text": "Well",
                "readingOrder": 1
            }, {
                "id": "w4",
                "text": "he",
                "readingOrder": 2
            }, {
                "id": "w6",
                "text": "made",
                "readingOrder": 3
            }, {
                "id": "w8",
                "text": "lots",
                "readingOrder": 4
            }, {
                "id": "w10",
                "text": "of",
                "readingOrder": 5
            }, {
                "id": "w12",
                "text": "people",
                "readingOrder": 6
            }, {
                "id": "w14",
                "text": "in",
                "readingOrder": 7
            }, {
                "id": "w16",
                "text": "the",
                "readingOrder": 8
            }, {
                "id": "w18",
                "text": "city",
                "readingOrder": 9
            }, {
                "id": "w20",
                "text": "SCREAM",
                "readingOrder": 10
            }, {
                "id": "w25",
                "text": "Ka-plink",
                "readingOrder": 11
            }, {
                "id": "w27",
                "text": "ka-plink",
                "readingOrder": 12
            }, {
                "id": "w29",
                "text": "ka-plink",
                "readingOrder": 13
            }, {
                "id": "w32",
                "text": "But",
                "readingOrder": 14
            }, {
                "id": "w34",
                "text": "the",
                "readingOrder": 15
            }, {
                "id": "w36",
                "text": "fluffiest",
                "readingOrder": 16
            }, {
                "id": "w38",
                "text": "dog",
                "readingOrder": 17
            }, {
                "id": "w40",
                "text": "still",
                "readingOrder": 18
            }, {
                "id": "w42",
                "text": "chased",
                "readingOrder": 19
            }, {
                "id": "w44",
                "text": "his",
                "readingOrder": 20
            }, {
                "id": "w46",
                "text": "cheese",
                "readingOrder": 21
            }, {
                "id": "w49",
                "text": "He",
                "readingOrder": 22
            }, {
                "id": "w51",
                "text": "went",
                "readingOrder": 23
            }, {
                "id": "w53",
                "text": "Tip",
                "readingOrder": 24
            }, {
                "id": "w55",
                "text": "tap",
                "readingOrder": 25
            }, {
                "id": "w57",
                "text": "Clickety-clack",
                "readingOrder": 26
            }, {
                "id": "w59",
                "text": "Rattle",
                "readingOrder": 27
            }, {
                "id": "w61",
                "text": "rattle",
                "readingOrder": 28
            }, {
                "id": "w63",
                "text": "clink",
                "readingOrder": 29
            }, {
                "id": "w66",
                "text": "Rattle",
                "readingOrder": 30
            }, {
                "id": "w68",
                "text": "rattle",
                "readingOrder": 31
            }, {
                "id": "w71",
                "text": "Clink",
                "readingOrder": 32
            }, {
                "id": "w73",
                "text": "clink",
                "readingOrder": 33
            }]);

            readingOrder.text.then(function(result) {
                console.log("recieved text" + result);
                expect(result).toEqual("Well:::he:::made:::lots:::of:::people:::in:::the:::city:::SCREAM:::Ka-plink:::ka-plink:::ka-plink:::But:::the:::fluffiest:::dog:::still:::chased:::his:::cheese:::He:::went:::Tip:::tap:::Clickety-clack:::Rattle:::rattle:::clink:::Rattle:::rattle:::Clink:::clink");
            });
        });

    });
});