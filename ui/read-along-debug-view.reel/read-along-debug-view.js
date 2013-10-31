var PageView = require("ui/page-view.reel").PageView;

exports.ReadAlongDebugView = PageView.specialize({

    draw: {
        value: function() {
            console.log("Drawing ", this.item);
            this.super();
        }
    },

    loadPage: {
        value: function() {
            this.super();
        }
    }
});
