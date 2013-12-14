var PageView = require("ui/page-view.reel").PageView,
    Template = require("montage/core/template").Template;

exports.ReadAlongDebugView = PageView.specialize({

    draw: {
        value: function() {
            console.log("Drawing ", this.item);
            this.super();
            var pageFrame = this.element.getElementsByTagName("iFrame")[0];
            if (pageFrame && pageFrame.src && pageFrame.src.indexOf("about:blank") === -1) {
                var srcUri = pageFrame.src,
                    self = this;

                srcUri = srcUri.replace("http://client/index.html?file=", "");
                console.log("Opening srcUri " + srcUri);
                
                require.read(srcUri).then(function(pagehtml) {
                    var doc,
                        template,
                        textNode,
                        textLines = [];

                    template = Template.create();
                    doc = template.createHtmlDocumentWithHtml(pagehtml);
                    var textNodes = doc.getElementsByTagName("text");
                    console.log(pagehtml, textNodes);

                    for (var node = 0; node < textNodes.length; node++) {
                        textNode = textNodes[node];
                        textLines.push(textNode.textContent);
                    }
                    self.item.text = textLines.join(" ::: ");
                });
            }

        }
    },

    loadPage: {
        value: function() {
            this.super();
        }
    }
});
