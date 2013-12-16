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
                        template,
                        textNode,
                        count = 0;

                    template = Template.create();
                    doc = template.createHtmlDocumentWithHtml(pagehtml);
                    var textNodes = doc.getElementById("textOverlay").getElementsByTagName("span");
                    console.log(textNodes);
                    for (var node = 0; node < textNodes.length; node++) {
                        textNode = textNodes[node];
                        if (textNode.id.indexOf("w") === 0) {
                            count++;
                            self.contents.push({
                                "id": textNode.id,
                                "text": textNode.innerText.trim(),
                                "readingOrder": count
                            });
                        }
                    }
                    console.log(JSON.stringify(self.contents));
                    deffered.resolve(self.contents);
                });

            });

            return deffered.promise;
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