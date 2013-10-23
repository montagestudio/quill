/*jshint maxcomplexity:20 */ // TODO: fix these warnings
var Component = require("montage/ui/component").Component,
    PDF2HTML = require("core/pdf2html.js").PDF2HTML;


var UNKNOWN_STATE = 0,
    FIRST_RUN_STATE = 1,
    LOADING_DOCUMENT_STATE = 2,
    DOCUMENT_LOADED_STATE = 3,
    LOADING_PAGE_STATE = 4,
    PAGE_LOADED_STATE = 5,
    RENDERING_PAGE_STATE = 6,
    PAGE_RENDERED_STATE = 7;

exports.PdfViewer = Component.specialize({
    _converter: {
        value: null
    },

    _state: {
        value: UNKNOWN_STATE
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
        value: UNKNOWN_STATE
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

    constructor: {
        value: function Viewer() {
            this.super();

            this._converter = PDF2HTML.create();
        }
    },

    enterDocument: {
        value: function(firstTime) {
            if (firstTime) {
                this._state = FIRST_RUN_STATE;
                this._drawState = UNKNOWN_STATE;

                document.addEventListener("keydown", this);
            }
        }
    },

    handleKeydown: {
        value: function(event) {
            if (event.keyIdentifier === "U+0034" || event.keyIdentifier === "U+0035") {
                var mode = event.keyIdentifier === "U+0034" ? 4 : 5;

                if (this.renderingMode !== mode) {
                    this.renderingMode = mode;
                }

                event.stopPropagation();
                event.preventDefault();
            }
        }
    },

    draw: {
        value: function() {
            var viewport = this.page ? this.page.getViewport(this.scale) : null,
                ctx = this._canvasView ? this._canvasView.getContext("2d") : null;

            // First run, let's install the views
            if (this._state >= FIRST_RUN_STATE && this._drawState < FIRST_RUN_STATE) {
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

            if (this._state >= LOADING_DOCUMENT_STATE && this._drawState < LOADING_DOCUMENT_STATE) {
                this.element.classList.add("pdf-viewer-loading");
                this.element.classList.remove("pdf-viewer-rendering");
            }

            if (this._state >= LOADING_PAGE_STATE && this._drawState < LOADING_PAGE_STATE) {
                this.element.classList.add("pdf-viewer-loading");
                this.element.classList.remove("pdf-viewer-rendering");
            }

            if (this._state >= PAGE_LOADED_STATE && this._drawState < PAGE_LOADED_STATE) {
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

            if (this._state >= PAGE_LOADED_STATE) {
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
        value: 0
    },

    renderingMode: {
        get: function() {
            return this._renderingMode;
        },

        set: function(value) {
            this._renderingMode = parseInt(value, 10);
            if (typeof this._renderingMode === "number") {
                this._converter.renderingMode = this._renderingMode;
                if (this.state >= DOCUMENT_LOADED_STATE) {
                    this.loadPage(this.pageNumber);
                }
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

            console.log("path:", this._documentPath, this.pageNumber);

            if (typeof value === "string" && value.length) {
                this.state = LOADING_DOCUMENT_STATE;
                // Load the document
                this._converter.getDocument(this._documentPath).then(function(pdf) {
                    thisRef._document = pdf;
                    thisRef.state = DOCUMENT_LOADED_STATE;
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
            if (this.state >= DOCUMENT_LOADED_STATE) {
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

            console.log("Load page", pageNumber, this.numberOfPages, this._page, this.state);
            if (this.state >= DOCUMENT_LOADED_STATE) {
                if (pageNumber > 0 && pageNumber <= this.numberOfPages && this.state !== LOADING_PAGE_STATE) {
                    this._page = null;

                    this.state = LOADING_PAGE_STATE;
                    this._pageNumber = pageNumber;
                    console.log("Page", this.pageNumber, "of", this.numberOfPages);

                    this._converter.getPage(this._document, this._pageNumber).then(function(page) {
                        console.log("...page", thisRef._pageNumber, "loaded");

                        thisRef._page = page;
                        thisRef.state = PAGE_LOADED_STATE;

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
            this.state = RENDERING_PAGE_STATE;

            this._converter.renderPage(this.page, this.canvasView, this.htmlView, this.scale).then(function(output){
                thisRef.state = PAGE_RENDERED_STATE;
                console.log("*** DONE RENDERING...:");
            },
            function(exception) {
                console.log("#ERROR:", exception.message, exception.stack);
            }).done();
        }
    }

});
