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

    dummyPage : {
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

                if (this.dummyPage === null) {
                    this.dummyPage = new PageDocument();
                    this.dummyPage.name = "blank";
                    this.dummyPage.type = "page";
                    this.dummyPage.url = null;
                    this.dummyPage.width = this.pages[1].width;
                    this.dummyPage.height = this.pages[1].height;
                }

                this.leftPage.item = index < 1 ? this.dummyPage : this.pages[index];
                this.rightPage.item = (index + 1 >= nbrPages) ? this.dummyPage : this.pages[index + 1];
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
        }
    },

    draw: {
        value: function() {
            var nbrPagesShown = (this.leftPage.width > 0) + (this.rightPage.width > 0),
                pagesWrapper = this.element.getElementsByClassName("spread-page-wrapper"),
                divider = this.element.getElementsByClassName("spread-divider")[0],
                top = Math.floor((this._clientHeight - Math.max(this.leftPage.height, this.rightPage.height)) / 2),
                style;

            // Update the size an position of the wrappers
            style = pagesWrapper[0].style;
            style.width = this.leftPage.width + "px";
            style.height = this.leftPage.height + "px";
            style.top = top + "px";

            if (nbrPagesShown === 1) {
                style.left = Math.floor((this._clientWidth - this.leftPage.width) / 2) + "px";
                pagesWrapper[1].style.left = this._clientWidth + "px";      // Push the right page out of the way
            } else if (nbrPagesShown === 2) {
                var left = Math.floor((this._clientWidth - this.leftPage.width - this.rightPage.width) / 2);

                style.left = left + "px";

                style = pagesWrapper[1].style;
                style.width = this.rightPage.width + "px";
                style.height = this.rightPage.height + "px";
                style.top = top + "px";
                style.left = (left + this.leftPage.width) + "px";
            } else {
                pagesWrapper[0].style.left = this._clientWidth + "px";      // Push the right page out of the way
                pagesWrapper[1].style.left = this._clientWidth + "px";      // Push the right page out of the way
            }

            // size and position the divider
            style = divider.style;
            if (nbrPagesShown === 2) {
                style.height = this.rightPage.height + "px";
                style.top = top + "px";
                style.left = pagesWrapper[1].style.left;
            } else {
                style.height = 0;
            }
        }
    }
});
