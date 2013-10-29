var Component = require("montage/ui/component").Component;

exports.PageThumbnail = Component.specialize({
    willDraw: {
        value: function() {
            if (this.item && this.element.clientWidth) {
                var scale = this.element.clientWidth / this.item.width;

                this.pageView.width = Math.floor(this.item.width * scale);
                this.pageView.height = Math.floor(this.item.height * scale);
            }
        }
    },

    draw: {
        value: function() {
            this.pageView.element.style.height = this.pageView.height + "px";
        }
    }
});
