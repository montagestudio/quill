var PageView = require("ui/page-view.reel").PageView,
    Template = require("montage/core/template").Template;

exports.ReadAlongDebugView = PageView.specialize({

    draw: {
        value: function() {
            console.log("Drawing ", this.item);
            this.super();
            this.pageDocument =  this.ownerComponent._dummyPage;

        }
    },

    pageDocument: {
        value: null
    },

    loadPage: {
        value: function() {
            this.super();
        }
    }
});
