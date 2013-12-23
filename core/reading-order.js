var Montage = require("montage").Montage,
    Promise = require("montage/core/promise").Promise,
    Template = require("montage/core/template").Template;

/**
 * This controls the reading order feature of an ebook page.
 */
exports.ReadingOrder = Montage.specialize({

    constructor: {
        value: function ReadingOrder() {
            return this.super();
        }
    },

    _pageNumber: {
        value: null
    },

    contents: {
        value: null
    },

    loadFromXHTML: {
        value: function(srcUri) {
            var self = this;
            this.contents = [];

            var deffered = Promise.defer();

            Promise.nextTick(function() {
                console.log("Opening srcUri " + srcUri);
                require.read(srcUri).then(function(pagehtml) {
                    var doc,
                        template;

                    template = Template.create();
                    doc = template.createHtmlDocumentWithHtml(pagehtml);
                    deffered.resolve(self.extractReadingOrder(doc));
                });

            });

            return deffered.promise;
        }
    },

    extractReadingOrder: {
        value: function(doc) {
            var textNode,
                count = 0;

            this.contents = [];
            var textNodes = doc.getElementById("textOverlay").getElementsByTagName("span");
            // console.log(textNodes);
            for (var node = 0; node < textNodes.length; node++) {
                textNode = textNodes[node];
                /* TODO consider keeping the , and . and ! and ? punctuation to improve alignment? */
                if (textNode.id.indexOf("w") === 0) {
                    var potentialText = textNode.innerText.trim();
                    /* skip words that look like they might be the page number */
                    if (potentialText == this._pageNumber) {
                        console.log("This looks like it might be the page number, skipping... ", textNode);
                        continue;
                    }
                    count++;
                    this.contents.push({
                        "id": textNode.id,
                        "text": potentialText,
                        "readingOrder": count
                    });
                }
            }
            // console.log("This page contains this many words " + JSON.stringify(this.contents.length));
            var triggerTextUpdate = this.text;
            return this.contents;
        }
    },

    text: {
        get: function() {
            var deffered = Promise.defer(),
                self = this;
            Promise.nextTick(function() {

                var text = "No text detected on this page.";
                if (self.contents) {
                    text = self.contents.map(function(item) {
                        return item.text;
                    }).join(":::");
                }
                deffered.resolve(text);
            });
            return deffered.promise;
        },
        set: function(value) {
            console.log("Cant set text of the reading order..." + value);
        }
    }

});