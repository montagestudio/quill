/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    Promise = require("montage/core/promise").Promise;

var PageView = exports.PageView = Component.specialize({

    _pages: {
        value: null
    },

    pages: {
        get: function() {
            return this._pages;
        },

        set: function(value) {
            this._pages = value;
            this.loadPage();
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
            this.loadPage();
        }
    },

    _viewMode: {
        value: "dual-right"
    },

    viewMode: {
        get: function() {
            return this._viewMode;
        },

        set: function(value) {
            this._viewMode = value;
            this.loadPage();
        }
    },

    resizeWrapper: {
        value: false
    },

    _pageData: {
        distinct:true,
        value: []
    },

    _pageSize: {
        distinct:true,
        value: []
    },

//    _pageCache: {
//        distinct:true,
//        value: []
//    },
//
    _loadPageTimer: {
        value: null
    },

    templateDidLoad: {
        value: function() {
        }
    },

    draw: {
        value: function() {
            var nbrPages = this.pages.length,
                pagesWrapper = this.element,
                iFrames = pagesWrapper.getElementsByTagName("iFrame"),
                innerWidth,
                innerHeight,
                viewMode = this.viewMode,
                nbrPagesShown,
                scale = 0,
                i;

            if (this.index == undefined || this.index < 0 || this.index >= nbrPages) {
                nbrPagesShown = 0;
            } else if (viewMode == "single" || this.index === 0) {
                nbrPagesShown = 1;
            } else {
                nbrPagesShown = 2;
            }


            // Inject pages data is available
            for (i = 0; i < nbrPagesShown; i ++) {
                var frame = iFrames[i],
                    page = this.pages[this.index],
                    blankPage = false;

                if (typeof this._pageData[i] == "string") {
                    frame.width = 0;
                    frame.height = 0;

                    var doc = frame.contentDocument;
                    if (doc) {
                        // clear the frame's content
                        if (doc.documentElement) {
                            doc.removeChild(doc.documentElement);
                        }

                        doc.open();
                            if (this._pageData[i].length) {
                                doc.writeln(this._pageData[i]);
                            } else {
                                doc.writeln('<html><head></head><body style="background-color: white; height:100%; width:100%"></body></html>');
                                blankPage = true;
                            }
                        doc.close();

                        if (blankPage) {
                            this._pageSize[i] = null
                        } else if (page.width && page.height) {
                            this._pageSize[i] = {width: page.width, height: page.height}
                        } else {
                            this._pageSize[i] = {width: doc.body.scrollWidth, height: doc.body.scrollHeight}
                        }

                        this._pageData[i] = null;
                    }

                    frame.classList.remove("page-view-hidden");
                }
            }

            for (i = nbrPagesShown; i < 2; i ++) {
                var frame = iFrames[i],
                    doc = frame.contentDocument;

                 // clear the frame's content
                if (doc && doc.documentElement) {
                    doc.removeChild(doc.documentElement);
                }

                frame.classList.add("page-view-hidden");
            }

            // Resize the iFrames to fit the available space

            innerWidth = Math.round(pagesWrapper.clientWidth / nbrPagesShown),
            innerHeight = pagesWrapper.clientHeight;

            if (innerHeight === 0) {
                if (innerWidth === 0) {
                    this.needsDraw = true;
                    return;
                } else {
                    innerHeight = Math.round(innerWidth * 3 / 2);
                }
            }

            for (i = 0; i < nbrPagesShown; i ++) {
                var iFrame = iFrames[i],
                    blankPage = false;

                if (this._pageSize[i]) {
                    iFrame.height = this._pageSize[i].height;
                    iFrame.width = this._pageSize[i].width;
                } else if (this._pageSize[(i + 1) % 2]) {
                    iFrame.height = this._pageSize[(i + 1) % 2].height;
                    iFrame.width = this._pageSize[(i + 1) % 2].width;
                    blankPage = true;
                } else {
                    blankPage = true;
//                    iFrame.height = 1024;
//                    iFrame.width = 1024;
                }

                // Use the same scale for both displayed page
                if (scale == 0) {
                    scale = Math.min(innerHeight / iFrame.height, innerWidth / iFrame.width);
                }

                if (this.resizeWrapper) {
                    innerHeight = Math.round(iFrame.height * scale);
                    innerWidth = Math.round(iFrame.width * scale);
                    pagesWrapper.style.height = innerHeight + "px";
                    pagesWrapper.style.width = (innerWidth * nbrPagesShown) + "px";
                }

                iFrame.style.webkitTransformOrigin = "0 0";
                iFrame.style.webkitTransform = "matrix(" + [scale, 0, 0, scale,
                    i == 0 ? Math.round((innerWidth - (iFrame.clientWidth * scale)) / (3 - nbrPagesShown)) : innerWidth - 1,
                        Math.round((innerHeight - (iFrame.clientHeight * scale)) / 2)].join(",") + ")";
            }
        }
    },

    _loadPage: {
        value: function() {
            var self = this,
                index = this.index,
                viewMode = this.viewMode;

            if (this.pages && this.pages[index]) {
                var maxPages,
                    nbrPages = this.pages.length;

                if (index === 0) {
                    maxPages = 1;

                    // JFD TODO: load the cover page into an iframe
                    if (this.pages[0].url) {
                        this._pageData[0] = '<html><body><img src="' + this.pages[0].url + '" height="100%"/></body></html>';
                    } else {
                        this._pageData[0] = '<html><body></body></html>';
                    }
                    this._pageData[1] = null;
                    this.needsDraw = true;
                    return;
                } else if (viewMode == "single" ) {
                    maxPages = 1;
                    this._pageData[1] = null;
                } else {
                    maxPages = 2;

                    // Adjust the index to make sure we display the proper page on the left side and right side
                    if (viewMode == "dual-right") {
                        index -= index & 1;
                    } else {
                        index -= (index + 1) & 1;
                    }
                }

                for (var i = 0; i < maxPages; i ++) {
                    if ((index + i === 0) || (index + i >= nbrPages)) {
                        // JFD TODO: load a blank page into the left side
                        this._pageData[i] = "";
                        this.needsDraw = true;
                    } else {
                        this._pageData[i] = this.pages[index + i]._cachedContent;
                        if (this._pageData[i]) {
                            this.needsDraw = true;
                        } else {
                            var pageNbr = index + i,
                                url = this.pages[pageNbr].url,
                                xhr;

                            if (url) {
                                xhr = new XMLHttpRequest();
                                xhr.open('GET', url, true);

                                xhr.params = {
                                    baseRef: url.substr(0, url.lastIndexOf("/") + 1),
                                    position: i,
                                    index: pageNbr
                                }

                                xhr.onload = function(e) {
                                    if (this.status == 200) {
                                        var pageData = this.response,
                                            pos;

                                        // Setup the base href
                                        pos = pageData.toLowerCase().indexOf("<head>")
                                        if (pos !== -1) {
                                            var rebased = pageData.substring(0, pos + 6);

                                            rebased += "\n";
                                            rebased += "<base href=\"" + this.params.baseRef + "\">";
                                            rebased += "\n";
                                            rebased += pageData.substring(pos + 7);

                                            pageData = rebased;
                                        }

                                        self._pageData[this.params.position] = pageData;
                                        self.pages[this.params.index]._cachedContent = pageData;

                                        self.needsDraw = true;
                                    } else {
                                        console.log("BOGUS XHR STATUS", this.status);
                                    }
                                };

                                xhr.send();
                            }
                        }
                    }
                }
            }
        }
    },

    loadPage: {
        value: function() {
            var self = this;

            if (this.pages && this.pages[this._index]) {
                if (this._loadPageTimer) {
                    clearTimeout(this._loadPageTimer);
                }

                this._loadPageTimer = setTimeout(function() {self._loadPage()}, 100);
            }
        }
    }

});
