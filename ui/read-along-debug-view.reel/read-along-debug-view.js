var PageView = require("ui/page-view.reel").PageView,
    ReadAlong = require("core/read-along").ReadAlong;

exports.ReadAlongDebugView = PageView.specialize({

    readAlong: {
        value: null
    },

    loadPage: {
        value: function() {
            this.super();
            if (this.readAlong) {
                this.readAlong = null;
            }

            if (this.item.url) {
                this.readAlong = new ReadAlong();
                this.readAlong.pageDocument = this.item;
                this.readAlong.xhtmlUrl = this.item.url.substring(0, this.item.url.indexOf("?"));
                this.readAlong.connect();
            }
        }
    },

    handleAction: {
        value: function() {
            if (this.readAlong.playing) {
                console.log("Pausing");
                this.readAlong.pauseReadAloud();
            } else {
                console.log("Playing");
                this.readAlong.playReadAloud();
            }
        }
    }
});