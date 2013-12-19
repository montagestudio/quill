var PageView = require("ui/page-view.reel").PageView,
    Template = require("montage/core/template").Template;

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
    },

    getButtonImage: {
        value: function(){
            if(this.item.readAlong.play){

            }
        }
    },
               // "src": {"<-": "@owner.item.readAlong.playing ? '../../assets/img/pause.png' : '../../assets/img/play.png' "},

    handleAction: {
        value: function() {
            if (this.item.readAlong.playing) {
                console.log("Pausing");
                this.readAlongButtofnState = "../../assets/img/play.png";
                this.item.readAlong.pauseReadAloud();
                // } else if (this.readAlongButtonState == "../../assets/img/play.png") {
            } else if (!this.item.readAlong.playing && this.item.readAlong.playReadAloudReady) {
                console.log("Playing");
                this.readAlongButtonState = "../../assets/img/pause.png";
                this.item.readAlong.playReadAloud();
            }
        }
    }
});