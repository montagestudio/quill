/*jshint maxcomplexity:27, bitwise: false */ // TODO: fix these warnings
var Component = require("montage/ui/component").Component,
    PageDocument = require("core/page-document").PageDocument;

exports.SpreadView = Component.specialize({

    _pages: {
        value: null
    },

    pages: {
        get: function() {
            return this._pages;
        },

        set: function(value) {
            var self = this;

            this._pages = value;
            this.needsDraw = true;
        }
    },

    _index: {
        value: 1
    },

    index: {
        get: function() {
            return this._index;
        },

        set: function(value) {
            this._index = value;
            this.needsDraw = true;
        }
    },

    _viewMode: {
        value: "default"
    },

    viewMode: {
        get: function() {
            return this._viewMode;
        },

        set: function(value) {
            this._viewMode = value;
            this.needsDraw = true;
        }
    },

    _showOverlay: {
        value: false
    },

    showOverlay: {
        get: function() {
            return this._showOverlay;
        },

        set: function(value) {
            this._showOverlay = value;
            this.needsDraw = true;
        }
    },

    _overlayUrl: {
        value: null
    },

    overlayUrl: {
        get: function() {
            return this._overlayUrl;
        },

        set: function(value) {
            this._overlayUrl = value;
            this.needsDraw = true;
        }
    },

    _overlayOpacity: {
        value: null
    },

    overlayOpacity: {
        get: function() {
            return this._overlayOpacity;
        },

        set: function(value) {
            if (value >= 0.0 && value <= 1.0) {
                this._overlayOpacity = value;
                this.needsDraw = true;
            }
        }
    },

    _autoOverlayOpacityTimer: {
        value: null
    },

    _autoOverlayOpacityStep: {
        value: 0.05
    },

    _autoOverlayOpacityDirection: {
        value: -1
    },

    _savedOverlayOpacity: {
        value: -1
    },

    _autoOverlayOpacity: {
        value: false
    },

    autoOverlayOpacity: {
        get: function() {
            return this._autoOverlayOpacity;
        },

        set: function(value) {
            var self = this;

            this._autoOverlayOpacity = value;
            if (value) {
                this.showOverlay = true;
                if (!this._autoOverlayOpacityTimer) {
                    this._autoOverlayOpacityTimer = setInterval(function() {
                        var opacity = parseFloat(self._overlayOpacity) + (self._autoOverlayOpacityStep * self._autoOverlayOpacityDirection);
                        if (opacity > 1) {
                            opacity = 1;
                            self._autoOverlayOpacityDirection = -1;
                        }
                        if (opacity < 0) {
                            opacity = 0;
                            self._autoOverlayOpacityDirection = 1;
                        }
                        self.overlayOpacity = opacity;
                    }, 50);
                    this._savedOverlayOpacity = this.overlayOpacity;
                }
            } else {
                this.showOverlay = false;
                if (this._autoOverlayOpacityTimer) {
                    clearInterval(this._autoOverlayOpacityTimer);
                    this._autoOverlayOpacityTimer = null;
                }
                this.overlayOpacity = this._savedOverlayOpacity;
            }
        }
    },

    _dummyPage : {
        value: null
    },

    willDraw: {
        value: function() {
            var index = this.index,
                nbrPages = this.pages.length,
                nbrPagesShown,
                viewMode = this.viewMode;

            // Saving our own dimension to use in the draw
            this._clientWidth = this.element.clientWidth;
            this._clientHeight = this.element.clientHeight;

            // Set the view mode
            if (viewMode === "default") {
                viewMode = nbrPages < 3 ? "single" : "dual-right";
            }

            // Figure out how many pages we need to display
            if (this.index === undefined || this.index < 0 || this.index >= nbrPages) {
                nbrPagesShown = 0;
            } else if (viewMode === "single" || this.index === 0) {
                nbrPagesShown = 1;
            } else {
                nbrPagesShown = 2;
            }

            // Setup the page's item
            if (nbrPagesShown === 0) {
                this.leftPage.item = null;
                this.rightPage.item = null;
            } else if (nbrPagesShown === 1) {
                this.leftPage.item = this.pages[index];
                this.rightPage.item = null;
            } else {
                if (viewMode === "dual-right") {
                    index -= index & 1;
                } else {
                    index -= (index + 1) & 1;
                }

                if (this._dummyPage === null) {
                    this._dummyPage = new PageDocument();
                    this._dummyPage.name = "blank";
                    this._dummyPage.type = "page";
                    this._dummyPage.url = null;
                    this._dummyPage.width = this.pages[1].width;
                    this._dummyPage.height = this.pages[1].height;
                }

                this.leftPage.item = index < 1 ? this._dummyPage : this.pages[index];
                this.rightPage.item = (index + 1 >= nbrPages) ? this._dummyPage : this.pages[index + 1];
            }

            // Setup the dimension for the pageView
            if (nbrPagesShown) {
                var width = this._clientWidth / nbrPagesShown,
                    height = this._clientHeight,
                    i = this.index === 0 ? 0 : index || index + 1,
                    scale;

                if (this.pages[i].width === 0 || this.pages[i].height === 0) {
                    // Sanity fallback
                    i = 1;
                }
                scale = Math.min(width / this.pages[i].width, height / this.pages[i].height);   // Use page one as template
                width = Math.ceil(this.pages[i].width * scale);
                height = Math.ceil(this.pages[i].height * scale);

                this.leftPage.width = width;
                this.leftPage.height = height;

                if (nbrPagesShown === 2) {
                    this.rightPage.width = width;
                    this.rightPage.height = height;
                } else {
                    this.rightPage.width = -1;
                    this.rightPage.height = -1;
                }
            } else {
                this.leftPage.width = -1;
                this.leftPage.height = -1;
                this.rightPage.width = -1;
                this.rightPage.height = -1;
            }

            // Setup the overlays if needed
            if (this.showOverlay) {
                this.rightOverlay.item = this.rightPage.item;
                this.leftOverlay.item = this.leftPage.item;
            } else {
                // Only turn off the overlay for good if the overlay item differ than the current one,
                // this to avoid flickers when turing on the overlay again on the same page
                if (this.rightOverlay.item && this.rightOverlay.item !== this.rightPage.item) {
                    this.rightOverlay.item = null;
                }
                if (this.leftOverlay.item && this.leftOverlay.item !== this.leftPage.item) {
                    this.leftOverlay.item = null;
                }
            }
        }
    },

    draw: {
        value: function() {
            var leftPage = this.leftPage,
                rightPage = this.rightPage,
                nbrPagesShown = (leftPage.width > 0) + (rightPage.width > 0),
                pagesWrapper = this.element.getElementsByClassName("spread-page-wrapper"),
                divider = this.element.getElementsByClassName("spread-divider")[0],
                top = Math.floor((this._clientHeight - Math.max(leftPage.height, rightPage.height)) / 2),
                style;

            // Update the size an position of the wrappers
            style = pagesWrapper[0].style;
            style.width = leftPage.width + "px";
            style.height = leftPage.height + "px";
            style.top = top + "px";

            if (nbrPagesShown === 1) {
                style.left = Math.floor((this._clientWidth - leftPage.width) / 2) + "px";
                pagesWrapper[1].style.left = this._clientWidth + "px";      // Push the right page out of the way
            } else if (nbrPagesShown === 2) {
                var left = Math.floor((this._clientWidth - leftPage.width - rightPage.width) / 2);

                style.left = left + "px";

                style = pagesWrapper[1].style;
                style.width = rightPage.width + "px";
                style.height = rightPage.height + "px";
                style.top = top + "px";
                style.left = (left + leftPage.width) + "px";
            } else {
                pagesWrapper[0].style.left = this._clientWidth + "px";      // Push the right page out of the way
                pagesWrapper[1].style.left = this._clientWidth + "px";      // Push the right page out of the way
            }

            // size and position the divider
            style = divider.style;
            if (nbrPagesShown === 2) {
                style.height = rightPage.height + "px";
                style.top = top + "px";
                style.left = pagesWrapper[1].style.left;
            } else {
                style.height = 0;
            }

            // Set the overlay opacity
            if (this.showOverlay && leftPage.item && leftPage.item.type === "page" && leftPage.item !== this._dummyPage) {
                leftPage.element.style.opacity = this.overlayOpacity;
            } else {
                leftPage.element.style.opacity = 1;
            }
            if (this.showOverlay && rightPage.item && rightPage.item.type === "page" && rightPage.item !== this._dummyPage) {
                rightPage.element.style.opacity = this.overlayOpacity;
            } else {
                rightPage.element.style.opacity = 1;
            }
        }
    }
});
