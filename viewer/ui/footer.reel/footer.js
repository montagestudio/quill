/*jshint maxcomplexity:20 */ // TODO: fix these warnings
var Component = require("montage/ui/component").Component;

exports.Footer = Component.specialize({

    viewer: {
        value: null
    },

    _mode: {
        value: "aside"
    },

    mode: {
        get: function() {
            return this._mode;
        },

        set: function(value) {
            this._mode = value;
            if (this.overlayRadio && this.asideRadio) {
                this.overlayRadio.element.checked = ("overlay" === value);
                this.asideRadio.element.checked = ("aside" === value);
            }
        }
    },

    _opacity: {
        value: 0.5
    },

    opacity: {
        get: function() {
            return parseFloat(this._opacity);
        },

        set: function(value) {
            this._opacity = parseFloat(value);
        }
    },

    _showText: {
        value: true
    },

    showText: {
        get: function() {
            return this._showText;
        },
        set: function(value) {
            this._showText = value;
        }
    },

    _showImage: {
        value: true
    },

    showImage: {
        get: function() {
            return this._showImage;
        },
        set: function(value) {
            this._showImage = value;
        }
    },

    _showGraphic: {
        value: true
    },

    showGraphic: {
        get: function() {
            return this._showGraphic;
        },
        set: function(value) {
            this._showGraphic = value;
        }
    },

    pageNumber: {
        value: 0
    },

    numberOfPages: {
        value: 0
    },

    overlayRadio: {
        value: null
    },

    asideRadio: {
        value: null
    },

    enterDocument: {
        value: function(firstTime) {
            if (firstTime) {
                document.addEventListener("keydown", this);
            }
        }
    },

    handleKeydown: {
        value: function(event) {
            if (event.keyIdentifier === "PageUp" || event.keyIdentifier === "PageDown") {
                if (!this.viewer || this.numberOfPages <= 1) {
                    return;
                }

                var pageNumber = this.pageNumber;
                if (event.keyIdentifier === "PageUp") {
                    pageNumber --;
                    if (pageNumber < 1) {
                        return;
                    }
                } else {
                    pageNumber ++;
                    if (pageNumber > this.numberOfPages) {
                        return;
                    }
                }

                console.clear();
                this.viewer.pageNumber = pageNumber;    // let the viewer set the page number as it might do some more validation, we will get the proper value via binding

                event.stopPropagation();
                event.preventDefault();
            }

            if (event.keyIdentifier === "Left" || event.keyIdentifier === "Right") {
                this.mode = event.keyIdentifier === "Left" ? "overlay" : "aside";

                event.stopPropagation();
                event.preventDefault();
            }

            if (event.keyIdentifier === "Up" || event.keyIdentifier === "Down") {
                if (this.mode === "overlay") {
                    if (event.keyIdentifier === "Down") {
                        this.opacity -= 0.25;
                        if (this.opacity < 0) {
                            this.opacity = 0;
                        }
                    } else {
                        this.opacity += 0.25;
                        if (this.opacity > 1) {
                            this.opacity = 1;
                        }
                    }

                    event.stopPropagation();
                    event.preventDefault();
                }
            }

        }
    }
});
