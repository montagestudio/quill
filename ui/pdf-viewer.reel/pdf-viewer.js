/* global lumieres */
var Montage = require("montage/core/core").Montage,
    Component = require("montage/ui/component").Component,
    PDF2HTML = require("core/pdf2html.js").PDF2HTML;


var STATE_Unknown = 0,
    STATE_FirstRun = 1,
    STATE_LoadingDocument = 2,
    STATE_DocumentLoaded = 3,
    STATE_LoadingPage = 4,
    STATE_PageLoaded = 5,
    STATE_RenderingPage = 6,
    STATE_PageRenderred = 7;

exports.PdfViewer = Montage.create(Component, {

    _state: {
        value: STATE_Unknown
    },

    state: {
        enumerable: false,
        get: function() {
            return this._state;
        },
        set: function(value) {
            this._state = value;
            this.needsDraw = true;
        }
    },

    _drawState: {
        value: STATE_Unknown
    },

    _canvasView : {
        value: null
    },

    canvasView : {
        enumerable: false,
        get: function() {
            return this._canvasView;
        }
    },

    _htmlView : {
        value: null
    },

    htmlView : {
        enumerable: false,
        get: function() {
            return this._htmlView;
        }
    },

    enterDocument: {
        value: function(firstTime) {
            if (firstTime) {
                this._state = STATE_FirstRun;
                this._drawState = STATE_Unknown;
            }
        }
    },

    draw: {
        value: function() {
            var viewport = this.page ? this.page.getViewport(this.scale) : null,
                ctx = this._canvasView ? this._canvasView.getContext("2d") : null;

            // First run, let's install the views
            if (this._state >= STATE_FirstRun && this._drawState < STATE_FirstRun) {
                this._canvasView = document.createElement("canvas");
                this._canvasView.classList.add("pdf-viewer-output");

                this.element.appendChild(this._canvasView);

                this._htmlView = document.createElement("div");
                this._htmlView.classList.add("pdf-viewer-output");
                this._htmlView.classList.add("pdf-viewer-html");
                this.element.appendChild(this._htmlView);

                this.element.classList.add("pdf-viewer-loading");
                this.element.classList.remove("pdf-viewer-rendering");
            }

            if (this._state >= STATE_LoadingDocument && this._drawState < STATE_LoadingDocument) {
                this.element.classList.add("pdf-viewer-loading");
                this.element.classList.remove("pdf-viewer-rendering");
            }

            if (this._state >= STATE_LoadingPage && this._drawState < STATE_LoadingPage) {
                this.element.classList.add("pdf-viewer-loading");
                this.element.classList.remove("pdf-viewer-rendering");
            }

            if (this._state >= STATE_PageLoaded && this._drawState < STATE_PageLoaded) {
                this.element.classList.add("pdf-viewer-rendering");
                this.element.classList.remove("pdf-viewer-loading");

                //
                // Prepare canvas using PDF page dimensions
                //
                var devicePixelRatio = window.devicePixelRatio;
devicePixelRatio = 1; //JFD DEBUG
                this._canvasView.height = viewport.height * devicePixelRatio;
                this._canvasView.width = viewport.width * devicePixelRatio;
                this._canvasView.style.height = viewport.height + "px";
                this._canvasView.style.width =  viewport.width + "px";
                ctx.transform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
                console.log("**** devicePixelRatio:", devicePixelRatio);

                this._htmlView.style.height = viewport.height + "px";
                this._htmlView.style.width = viewport.width + "px";
                this._drawMode = "unknown";
            }

            if (this._state >= STATE_PageLoaded) {
                if (this._mode !== this._drawMode) {
                    if (this._mode === "aside") {
                        this._htmlView.style.left = (viewport.width + 10) + "px";
                        this._htmlView.style.opacity = 1.0;
                        this._drawOpacity = 1.0;
                    } else {
                        this._htmlView.style.left = 0;
                        this._htmlView.style.opacity = this.opacity;
                        this._drawOpacity = this.opacity;
                    }

                    this._drawMode = this._mode;
                }

                if (this.opacity !== this._drawOpacity) {
                    if (this._mode === "overlay") {
                        this._htmlView.style.opacity = this.opacity;
                        this._drawOpacity = this.opacity;
                    }
                }

                if (this.showText !== this._drawShowText) {
                    if (this.showText) {
                        this._htmlView.classList.remove("no-text");
                    } else {
                        this._htmlView.classList.add("no-text");
                    }
                    this._drawShowText = this.showText;
                }

                if (this.showImage !== this._drawShowImage) {
                    if (this.showImage) {
                        this._htmlView.classList.remove("no-image");
                    } else {
                        this._htmlView.classList.add("no-image");
                    }
                    this._drawShowImage = this.showImage;
                }

                if (this.showGraphic !== this._drawShowGraphic) {
                    if (this.showGraphic) {
                        this._htmlView.classList.remove("no-graphic");
                    } else {
                        this._htmlView.classList.add("no-graphic");
                    }
                    this._drawShowGraphic = this.showGraphic;
                }

                if (this.showBox !== this._drawShowBox) {
                    if (this.showBox) {
                        this._htmlView.classList.add("show-box");
                    } else {
                        this._htmlView.classList.remove("show-box");
                    }
                    this._drawShowBox = this.showBox;
                }

            }

            this._drawState = this._state;
        }
    },

    _renderingMode: {
        value: 3
    },

    renderingMode: {
        get: function() {
            return _renderingMode;
        },

        set: function(value) {
            this._renderingMode = parseInt(value, 10);
            if (typeof this._renderingMode == "number") {
                PDF2HTML.renderingMode = this._renderingMode;
            }
        }
    },

    _drawMode: {
        value: "unknown"
    },

    _mode: {
        value: "overlay"
    },

    mode: {
        get: function() {
            return this._mode;
        },

        set: function(value) {
            this._mode = value;
            this.needsDraw = true;
        }
    },

    _scale: {
        value: 1.5
    },

    scale: {
        get: function() {
            return this._scale;
        },

        set: function(value) {
            if (value !== null && value !== undefined) {
                this._scale = parseFloat(value);
            }
            // JFD TODO: need to reprocess the page...
        }
    },

    _drawOpacity: {
        value: null
    },

    _opacity: {
        value: 0.5
    },

    opacity: {
        get: function() {
            return this._opacity;
        },
        set: function(value) {
            this._opacity = value;
            this.needsDraw = true;
        }
    },

    _drawShowText: {
        value: null
    },

    _showText: {
        value: true
    },

    showText: {
        get: function() {
            return this._showText;
        },
        set: function(value) {
            console.log("-------- set showText to", value)
            this._showText = value;
            this.needsDraw = true;
        }
    },

    _drawShowImage: {
        value: null
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
            this.needsDraw = true;
        }
    },

    _drawShowGraphic: {
        value: null
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
            this.needsDraw = true;
        }
    },

    _drawShowBox: {
        value: null
    },

    _showBox: {
        value: false
    },

    showBox: {
        get: function() {
            return this._showBox;
        },
        set: function(value) {
            this._showBox = value;
            this.needsDraw = true;
        }
    },

    _documentPath: {
        value: null
    },

    documentPath: {
        get: function() {
            return this._documentPath;
        },

        set: function(value) {
            var thisRef = this,
                tempElem = document.createElement("a");

            tempElem.href = value;
            //Trick: Setting and then getting the href of an anchor will normalize the URL
            this._documentPath = tempElem.href;

            // JFD TODO: how to stop a current loading?

            this._document = null;
            this._page = null;

            console.log("path:", this._documentPath, this.pageNumber)

            if (typeof value === "string" && value.length) {
                this.state = STATE_LoadingDocument;
console.log("WILL LOAD:")
                // Load the document
                PDF2HTML.getDocument(this._documentPath).then(function(pdf) {
console.log("PDF:", pdf)
                    thisRef._document = pdf;
                    thisRef.state = STATE_DocumentLoaded;
                    thisRef.numberOfPages = pdf.pdfInfo.numPages;

                    // let's load a page
                    thisRef.loadPage(thisRef.pageNumber);
                }, function(exception) {
                    console.log("#ERROR:", exception.message, exception.stack);
                });
            }
        }
    },

    _document: {
        value: null
    },

    document: {
        get: function() {
            return this._document;
        }
    },

    _page: {
        value: null
    },

    page: {
        get: function() {
            return this._page;
        }
    },

    _pageNumber: {
        value: 1
    },

    pageNumber: {
        get: function() {
            return parseInt(this._pageNumber, 10);
        },
        set: function(value) {
            console.log("set pageNumber:", value, parseInt(value, 10));
            if (this.state >= STATE_DocumentLoaded) {
                this.loadPage(parseInt(value, 10));
            } else {
                this._pageNumber = value;
            }
        }
    },

    numberOfPages: {
        value: 0
    },

    loadPage: {
        value: function(pageNumber) {
            var thisRef = this;

            console.log("Load page", pageNumber, this.numberOfPages, this._page, this.state)
            if (this.state >= STATE_DocumentLoaded) {
                if (pageNumber > 0 && pageNumber <= this.numberOfPages && this.state !== STATE_LoadingPage) {
                this._page = null;

                this.state = STATE_LoadingPage;
                this._pageNumber = pageNumber;
                console.log("Page", this.pageNumber, "of", this.numberOfPages)

                PDF2HTML.getPage(this._document, this._pageNumber).then(function(page) {
                    console.log("...page", thisRef._pageNumber, "loaded")

                    thisRef._page = page;
                    thisRef.state = STATE_PageLoaded;

                    thisRef.renderPage();
                },
                function(exception) {
                    console.log("#ERROR:", exception.message, exception.stack);
                });
            }
            } else {
                this._pageNumber = pageNumber;
            }
        }
    },

    renderPage: {
        value: function() {
            var thisRef = this;
            this.state = STATE_RenderingPage;
            PDF2HTML.renderPage(this.page, this.scale, this.canvasView, this.htmlView).then(function(){
                thisRef.state = STATE_PageRenderred;
                console.log("*** DONE RENDERING...:", exception);
            },
            function(exception) {
                console.log("#ERROR:", exception.message, exception.stack);
            });
        }
    }

});
