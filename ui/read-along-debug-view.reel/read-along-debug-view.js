var PageView = require("ui/page-view.reel").PageView,
    Template = require("montage/core/template").Template;

exports.ReadAlongDebugView = PageView.specialize({
    handleAction: {
        value: function() {
            if (this.item.readAlong.playing) {
                console.log("Pausing");
                this.item.readAlong.pauseReadAloud();
            } else {
                console.log("Playing");
                this.item.readAlong.playReadAloud();
            }
        }
    }
});