/*jshint maxcomplexity:27, bitwise: false */ // TODO: fix these warnings
var Component = require("montage/ui/component").Component;

exports.PageView = Component.specialize({

    _item: {
        value: null
    },

    item: {
        get: function() {
            return this._item;
        },

        set: function(value) {
            if (this._item !== value) {
                this._item = value;
                this.loadPage();
            }
        }
    },

    _width: {
        value: 0
    },

    width: {
        get: function() {
            return this._width;
        },

        set: function(value) {
            if (this._width !== value) {
                this._width = value;
                this.needsDraw = true;
            }
        }
    },

    _height: {
        value: 0
    },

    height: {
        get: function() {
            return this._height;
        },

        set: function(value) {
            if (this._height !== value) {
                this._height = value;
                this.needsDraw = true;
            }
        }
    },

    _pageDrawInfo: {
        value: null
    },

    draw: {
        value: function() {
            var item = this.item,
                pagesWrapper = this.element,
                frame = pagesWrapper.getElementsByTagName("iFrame")[0],
                innerWidth,
                innerHeight,
                scale;


            // Inject pages data is available
            if (this._pageDrawInfo) {
                frame.width = 0;
                frame.height = 0;

                if (this._pageDrawInfo.data) {
                    // Blank page or cover image, draw in two steps to work around cross-origin restriction
                    if (frame.src === "about:blank") {
                        var doc = frame.contentDocument;
                        if (doc) {
                            // clear the frame's content
                            if (doc.documentElement) {
                                doc.removeChild(doc.documentElement);
                            }
                            doc.open();
                            doc.writeln(this._pageDrawInfo.data);
                            doc.close();
                        }

                        this._pageDrawInfo = null;
                    } else {
                        frame.src = "about:blank";
                        this.needsDraw = true;
                    }
                } else if (this._pageDrawInfo.url) {
                    // Regular page
                    if (frame.src !== this._pageDrawInfo.url) {
                        frame.src = this._pageDrawInfo.url;

                        var self = this;
                        var associatePage = function (evt) {
                            frame.removeEventListener("load", associatePage);
                            self.dispatchEventNamed("loadedPage", true, true, {
                                pageWindow: frame.contentWindow,
                                page: self.item
                            });
                        };

                        frame.addEventListener("load", associatePage, false);
                    }

                    this._pageDrawInfo = null;
                }
            }

            // Transform the iFrames using to fit either the specified of the available space
            innerWidth = this.width  || pagesWrapper.clientWidth;
            innerHeight = this.height || pagesWrapper.clientHeight;

            if (innerHeight === 0) {
                if (innerWidth === 0) {
                    // Looks like the iFrame has not yet been rendered, let's try again on the next draw
                    this.needsDraw = true;
                    return;
                } else {
                    // By default, set the height to 1.5 x the width
                    innerHeight = Math.round(innerWidth * 1.5);
                }
            }

            frame.width = item ? item.width : 0;
            frame.height = item ? item.height : 0;

            scale = Math.min(innerHeight / frame.height, innerWidth / frame.width);

            frame.style.webkitTransformOrigin = "0 0";
            frame.style.webkitTransform = "scale(" + scale + ")";
        }
    },

    loadPage: {
        value: function() {
            var item = this.item,
                blankPage = '<html><head></head><body style="background-color: white; height:100%; width:100%"></body></html>';

            if (item) {
                if (item.type === "image") {
                    // JFD TODO: we should maybe use another component to render the cover page
                    if (this.item.url) {
                        this._pageDrawInfo = {data:'<html><body style="margin: 0"><img src="' + item.url + '" height="100%"/></body></html>'};
                    } else {
                        this._pageDrawInfo = {data:'<html><body></body></html>'};
                    }
                } else {
                    if (item.url) {
                        this._pageDrawInfo = {url: item.url};
                    } else {
                        this._pageDrawInfo = {data: blankPage};
                    }
                }
            } else {
                this._pageDrawInfo = {data: blankPage};
            }
            this.needsDraw = true;
        }
    }
});
