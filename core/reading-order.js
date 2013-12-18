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
                    // console.log(textNodes);
                    for (var node = 0; node < textNodes.length; node++) {
                        textNode = textNodes[node];
                        /* TODO consider keeping the , and . and ! and ? punctuation to improve alignment? */
                        if (textNode.id.indexOf("w") === 0) {
                            var potentialText = textNode.innerText.trim();
                            /* skip words that look like they might be the page number */
                            if (potentialText == self._pageNumber) {
                                console.log("This looks like it might be the page number, skipping... ", textNode);
                                continue;
                            }
                            count++;
                            self.contents.push({
                                "id": textNode.id,
                                "text": potentialText,
                                "readingOrder": count
                            });
                        }
                    }
                    // console.log("This page contains this many words " + JSON.stringify(self.contents.length));
                    var triggerTextUpdate = self.text;
                    deffered.resolve(self.contents);
                });

            });

            return deffered.promise;
        }
    },

    workaroundForPromiseController: {
        value: null
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
                self.workaroundForPromiseController = text;
                deffered.resolve(text);
            });
            return deffered.promise;
        },
        set: function(value) {
            console.log("Cant set text of the reading order..." + value);
        }
    }

});