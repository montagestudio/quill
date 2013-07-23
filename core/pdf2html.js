var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    PDF2HTMLCache = require("./pdf2html-cache.js").PDF2HTMLCache,
    adaptConnection = require("q-connection/adapt"),
    Connection = require("q-connection");


var origin_time = new Date().getTime();
var timestamp = function() {return "[" + ((new Date().getTime() - origin_time) % 600000) / 1000 + "] "};

var renderingMode = 4;

var xmlns = "http://www.w3.org/2000/svg";

var IS_IN_LUMIERES = (typeof lumieres !== "undefined");


function setVendorStyleAttribute(style, name, value) {
    // While this method does set the vendor attribute for all 3 major vendors, this is only useful at runtime!
    // When we will serialize the dom, we will only see the attribute for the current vendor, we will have to
    // add back the other vendors

    style[name] = value;

    name = name[0].toUpperCase() + name.substr(1);
    style["webkit" + name] = value;
    style["moz" + name] = value;
    style["ms" + name] = value;
}

function putBinaryImageData(ctx, data, w, h) {
  var tmpImgData = 'createImageData' in ctx ? ctx.createImageData(w, h) :
    ctx.getImageData(0, 0, w, h);

  var tmpImgDataPixels = tmpImgData.data;
  if ('set' in tmpImgDataPixels)
    tmpImgDataPixels.set(data);
  else {
    // Copy over the imageData pixel by pixel.
    for (var i = 0, ii = tmpImgDataPixels.length; i < ii; i++)
      tmpImgDataPixels[i] = data[i];
  }

  ctx.putImageData(tmpImgData, 0, 0);
}


function blobFromDataURL(dataURL) {
  // convert base64 to raw binary data held in a string
  // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
  var byteString = atob(dataURL.split(',')[1]);

  // separate out the mime component
  var mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0]

  // write the bytes of the string to an Uint8Array
  var length = byteString.length,
       bytes = new Uint8Array(length);

  for (var i = 0; i < length; i ++) {
      bytes[i] = byteString.charCodeAt(i);
  }

  // write the ArrayBuffer to a blob, and you're done
  var blob = new Blob([bytes], {type: mimeString});
    return blob;
}

var _baselineOffsetCache = {};
function getBaselineOffset(font, data, fontStyle, height) {

    if (_baselineOffsetCache[fontStyle] !== undefined) {
        return _baselineOffsetCache[fontStyle];
    }

    // do we have an font.ascent?
// JFD TODO: does not always work, I must be missing something in the equation!
//    if (font.ascent !== undefined && font.ascent !== 0) {
//        _baselineOffsetCache[fontStyle] = -height * font.ascent * font.fontMatrix[0];
//        return _baselineOffsetCache[fontStyle];
//    }

    // else, let's try brute force by dawing it on a temporary canvas
    var canvas = document.createElement('canvas'),
        ctx = canvas.getContext("2d"),
        charWidth;

    var _findVerticalFirstPixel = function(ctx, originX, width) {
        var pixels = ctx.getImageData(originX, 0, originX + width, canvas.height);
        for (var x = 0; x < pixels.width; x ++) {
            for (var y = 0; y < pixels.height; y ++) {
               if (pixels.data[((x + y * pixels.width) * 4) + 3] !== 0) {
                   return y;
               }
           }
        }

        return -1;
    };

    canvas.width = 100;
    canvas.height = height * 10;     // to make sure we can deal with the most exotic font


    // Let's make sure we have enough glyphs in the font cache
    if (typeof data !== "string") {
        data.forEach(function(item) {
            if (typeof item === "string") {
                font.charsToGlyphs(item);
            }
        })
    } else {
        font.charsToGlyphs(data);
    }

    for (var seq in font.charsCache) {
        var glyphs = font.charsCache[seq];

        for (var i = 0; i < glyphs.length; i ++) {
            var character = glyphs[i] ? glyphs[i].fontChar : null;

            if (character === null) {
                continue;
            }

            ctx.save();
            ctx.font = fontStyle;
            charWidth = ctx.measureText(character).width || 64; // Some time ctx.mesureText returns 0, let use a default char width
            canvas.width = charWidth;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = fontStyle;     // the context was reset when resizing the canvas!
            ctx.fillStyle = "rgba(0, 0, 0, 255)";

            ctx.textBaseline = "alphabetic";
            ctx.fillText(character, 0, height * 5);
            var baseline = _findVerticalFirstPixel(ctx, 0, charWidth);
            if (baseline !== -1) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.textBaseline = "top";
                ctx.fillText(character, 0, height * 5);

                var topline = _findVerticalFirstPixel(ctx, 0, charWidth);
                if (topline !== -1) {
                    _baselineOffsetCache[fontStyle] = baseline - topline;
                    return baseline - topline;
                }
            }

            ctx.restore();
        }
    }

    console.warn("#error: cannot calculate the baseline offset!, will return 90% of the font height");
    return - height * 0.9;
}

function sanitizeFontName(fontName) {
    // convert the name of a partial font set to is full set equivalent

    if (fontName.length > 7 && fontName.charAt(6) == "+") {
        return fontName.substring(7);
    }

    return fontName;
}

function roundValue(value, precission) {
    if (typeof precission !== "number") {
        precission = 3;
    }

    var factor = Math.pow(10, precission);
    return Math.round(value * factor) / factor;
}

function sanitizeCSSValue(value) {
    var tempVal = value.toString();
    if (tempVal.indexOf("e") !== -1) {
        value = value.toFixed(12);
    }

    return roundValue(value, 12);
}

exports.PDF2HTML = Montage.create(Montage, {

    renderingMode: {
        get: function() {
            return renderingMode;
        },

        set: function(value) {
            if (typeof value === "number" && !isNaN(value)) {
                renderingMode = value;
            }
        }
    },

    rootDirectory: {
        value: "~/"
    },

    _backend: {
        value: null
    },

    backend: {
        get: function () {
            var self = this,
                resolvePort = function () {
                    if (lumieres.nodePort) {
                        port.resolve(lumieres.nodePort);
                    }
                };

            if (self._backend == null) {
                var port = Promise.defer();
                if (lumieres.nodePort) {
                    port.resolve(lumieres.nodePort);
                } else {
                    while (port.promise.isPending()) {
                        port.promise.delay(20).then(resolvePort);
                    }
                }
                var connection = adaptConnection(new WebSocket("ws://localhost:" + lumieres.nodePort));
                connection.closed.then(function () {
                    self._backend = null;
                });

                self._backend = Connection(connection);
            }

            return self._backend;
        }
    },

    getDocument: {
        value: function(path, outputDirectory) {
            var self = this,
                defered = Promise.defer();

            // note: PDFJS uses it own variation of promise
            PDFJS.getDocument(path).then(
                function(pdf) {
                    self._pdf = pdf;
                    pdf.cssFonts = {};  // Setup a cache for the fonts

                    if (IS_IN_LUMIERES && outputDirectory) {
                        self.rootDirectory = outputDirectory;

                        Montage.create(PDF2HTMLCache).initialize(self.rootDirectory + "/assets/", pdf).then(function(cache) {
                                PDFJS.objectsCache = cache;
                                defered.resolve(pdf)
                            }, function(error) {
                                console.warn(error);
                                defered.resolve(pdf)
                            }
                        );
                    } else {
                        defered.resolve(pdf)
                    }
                },
                function(exception) {
                    defered.reject(exception);
                },
                function(progress) {
                    defered.notify(progress);
                });

            return defered.promise;
        }
    },

    getPage: {
        value: function(pdf, pageNumber) {
            var defered = Promise.defer();

            if (!pdf || !pdf.pdfInfo) {
                defered.reject(new Error("Invalid pdf document"));
            } else if (!pdf || pageNumber < 1 || pageNumber > pdf.pdfInfo.numPages) {
                defered.reject(new Error("Invalid page number " + pageNumber));
            } else {
                pdf.getPage(pageNumber).then(
                    function(page) {
                        defered.resolve(page)
                    },
                    function(exception) {
                        defered.reject(exception)
                    },
                    function(progress) {
                        console.log("...getPage progress:", progress);
                        defered.notify(progress);
                    });
            }

            return defered.promise;
        }
    },

    renderPage: {
        value: function(page, scale, canvas, rootNode) {
            var self = this,
                defered = Promise.defer(),
                renderContext,
                ctx = canvas.getContext('2d');

            renderContext = {
                canvasContext: ctx,
                viewport: page.getViewport(scale)
            };

            this._rootNodeStack = [rootNode];
            if (rootNode) {
                // Revoke previous blob URLs
                var images = rootNode.getElementsByTagName("img");
                [].forEach.call(images, function(image) {
                    if (image.src.substring(0, 5) === "blob:") {
                        window.URL.revokeObjectURL(image.src);
                    }
                })
                rootNode.innerHTML = "";
                this._imageLayer.owner = this;
                this._imageLayer.page = page;
                this._imageLayer.scale = scale;
                renderContext.imageLayer = this._imageLayer;

                this._textLayer.owner = this;
                this._textLayer.page = page;
                this._textLayer.scale = scale;
//                renderContext.textLayer = this._textLayer;

                this._preProcessor.owner = this,
                this._preProcessor.page = page;
                this._preProcessor.scale = scale;
                renderContext.preProcessor = this._preProcessor;
            }

            renderContext.continueCallback = function(callback) {
                console.log("  >>> next");
                self._preProcessor.endSVG();
                callback();
            }

            try {
                page.render(renderContext).then(
                    function() {
                        console.log("...success");

                        if (IS_IN_LUMIERES) {
                            var fs = self.backend.get("fs"),
                                folderPath = decodeURIComponent((self.rootDirectory + "/pages/").substring("fs://localhost".length)),
                                data,
                                styleNode,
                                style;

                            styleNode = rootNode.getElementsByTagName("style")[0];
                            if (styleNode) {
                                // remove the style from the body
                                styleNode.parentNode.removeChild(styleNode);
                            } else {
                                styleNode = document.createElement("style");
                            }

                            // Add font-face style rules
                            for (var property in self._pdf.cssFonts) {
                              if (self._pdf.cssFonts.hasOwnProperty(property)) {
                                  var fontExpr = new RegExp(property, "g");

                                  styleNode.appendChild(document.createTextNode(self._pdf.cssFonts[property].style + "\n"));

                                  // Replace the font name everywhere
//                                  data = data.replace(fontExpr, self._pdf.cssFonts[property].fontName);
                              }
                            }

                            // Get the style as text
                            style = styleNode.innerHTML;
                            data = rootNode.innerHTML;

                            // Put the style back (needed by the viewer)
                            if (styleNode) {
                                rootNode.insertBefore(styleNode, rootNode.firstChild)
                            }

                            // Convert URL to relative
                            var expr = new RegExp(encodeURI(self.rootDirectory) + "/", "g");
                            data = data.replace(expr, "../");
                            style = style.replace(expr, "../");

                            //replace entities (for now just the nbsp entity
                            data = data.replace(/&nbsp;/g, "&#160;");
                            style = style.replace(/&nbsp;/g, "&#160;");

                            // properly terminate tags, XML is very strict!
                            var tags = ["img"]
                            expr = new RegExp("(<(" + tags.join("|") + ") [^>]*[^/])(>)", "gi");
                            data = data.replace(expr, "$1/$3");

// TODO: temporary for image resize by factor 2
//    data = data.replace(/(<img [^>]*-webkit-transform: matrix\()([^)]*)(\)[^>]*\/>)/gi, function(match, param1, param2, param3){
//        var matrix = param2.replace(/ /g, "").split(",");
//        matrix[0] *= 2.0;
//        matrix[3] *= 2.0;
//        return param1 + matrix.join(", ") + param3
//    });

                            //add extra vendor CSS properties
                            data = data.replace(/\<[a-z]* [^>]*(-webkit-[a-z0-9\-]*:[^;>]*)[^>]*>/gi, function(match) {
                                return match.replace(/-webkit-[a-z0-9\-]*:[^;>]*/gi, function(match) {
                                    var rule = match.substr("-webkit-".length);

                                    match += "; -moz-" + rule +
                                             "; -ms-" + rule +
                                             "; " + rule;
                                    return match;
                                })
                            });

                            self.backend.get("plume-backend").invoke("createFromTemplate",
                                "/pdf-converter/templates/page.xhtml",
                                folderPath + (page.pageInfo.pageIndex + 1) + ".xhtml",
                                {
                                    "page-width": Math.round(renderContext.viewport.width),
                                    "page-height": Math.round(renderContext.viewport.height),
                                    "page-title": "page " + (page.pageInfo.pageIndex + 1),
                                    "page-headers": "",
                                    "page-style": style,
                                    "page-content": data
                                },
                                true
                            ).then(function() {
                                page.destroy();
                                defered.resolve();
                            }, function(execption) {
                                page.destroy();
                                defered.reject(exception)
                            });
                        } else {
                            page.destroy();
                            defered.resolve();
                        }
                    },
                    function(exception) {
                        console.log("...error:", exception.message, exception.stack);
                        page.destroy();
                        defered.reject(exception)
                    },
                    function(progress) {
                        console.log("...renderPage progress:", progress);
                        defered.notify(progress);
                    });

            } catch(e) {
                console.log("RENDERING ERROR:", e.message, e.stack);
                defered.reject(e);
            }

            return defered.promise;
        }
    },

    _rootNodeStack: {
        value: [null]
    },

    _pdf: {
        value: null
    },

    _imageLayer: {
        value: {
            beginLayout: function() {
                console.log("IMG:beginLayout")
            },

            endLayout: function() {
                console.log("IMG:endLayout")
            },

            appendImage: function(object) {
                console.log("  IMG:appendImage", object);

                var context = object.context,
                    transform = context.ctx.mozCurrentTransform,
                    position,
                    elem,
                    imageBlob = null;

                if (object.objId) {
                    elem = context.objs.get(object.objId);

                    position = context.getCanvasPosition(0, -elem.height);
                    transform[4] = position[0];
                    transform[5] = position[1];
                } else {
                    var imageData = object.imgData,
                        width = imageData.width,
                        height = imageData.height,
                        imageCanvas = createScratchCanvas(width, height),
                        imageCtx = imageCanvas.getContext('2d');

                    position = context.getCanvasPosition(0, -height);
                    transform[4] = position[0];
                    transform[5] = position[1];


                    if (typeof ImageData !== 'undefined' && imageData instanceof ImageData) {
                        imageCtx.putImageData(imageData, 0, 0);
                    } else {
                        if (imageData.data) {
                            putBinaryImageData(imageCtx, imageData.data, width, height);
                        } else {
                            console.log("======== MASK:", typeof Element, imageData.tagName)
                            // JFD TODO: this is likely to be a mask which we do not yet support, just ignore for now...
                            return;
                        }
                    }

                    elem = document.createElement("img");
                    imageBlob = blobFromDataURL(imageCanvas.toDataURL("image/jpeg"));
                }

                if (imageBlob) {
                    elem.src = URL.createObjectURL(imageBlob);
                }
                setVendorStyleAttribute(elem.style, "transform", "matrix(" + sanitizeCSSValue(transform[0]) + ", " + sanitizeCSSValue(transform[1]) + ", " +
                    sanitizeCSSValue(transform[2]) + ", " + sanitizeCSSValue(transform[3]) + ", " + sanitizeCSSValue(transform[4]) + ", " + sanitizeCSSValue(transform[5]) + ")");

                this.owner._rootNodeStack[0].appendChild(elem);
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\n"));
            }
        }
    },

    _textLayer: {
        value: {
            beginLayout: function() {
                console.log("TEXT:beginLayout")
            },
            endLayout: function() {
                console.log("TEXT:endLayout")
            },

            showText: function(context, text) {
                if (renderingMode < 3) return;

                var self = this,
                    isSpacedText = typeof text !== "string",
                    current = context.current,
                    ctx = context.ctx,
                    font = current.font,
                    fontName = /*font.name || */font.loadedName,
                    fallbackName;
                    fontSize = current.fontSize,
                    fontSizeScale = /*current.fontSizeScale*/ 1.0,
                    charSpacing = current.charSpacing,
                    wordSpacing = current.wordSpacing,
                    fontDirection = current.fontDirection,
                    outerElem = document.createElement("span"),
                    outerElemStyle = outerElem.style,
                    previousSpan = null,
                    vOffset = null,
                    glyphs = isSpacedText ? null : font.charsToGlyphs(text),
                    data = isSpacedText ? text : glyphs,
                    dataLen = data.length,
                    x = 0,
                    previousX = 0,
                    previousRoundScaledX = 0,
                    roundPosition = (renderingMode === 4),
                    roundingPrecission = 2,
                    i;

                console.log("========== showText:", data, fontSize);

                try {

                ctx.save();
                context.applyTextTransforms();


                // Export the font
                    // JFD TODO: write them to disk...
                if (this.owner._pdf.cssFonts[fontName] == undefined) {
                    if (font.url) {
                        self.owner._pdf.cssFonts[fontName] = {
                            style: '@font-face {font-family: "' + fontName + '"; src: url(\'' + font.url + '\');}',
                            loadedFontName: font.loadedName,
                            fontName: font.name
                        };
                    } else {
                        var fontStyle = font.bindDOM();
                        self.owner._pdf.cssFonts[fontName] = {
                            style: fontStyle
                        }
                    }
                }

                fallbackName = sanitizeFontName(font.name);
                if (fallbackName !== font.fallbackName) {
                    fallbackName += ", " + font.fallbackName;
                } else {
                    fallbackName = font.fallbackName;
                }

// JFD TODO: Not sure how to apply the line width for text outline in css
                var lineWidth = current.lineWidth,
                    a1 = current.textMatrix[0],
                    b1 = current.textMatrix[1],
                    scale = Math.sqrt(a1 * a1 + b1 * b1);

                if (scale === 0 || lineWidth === 0)
                  lineWidth = context.getSinglePixelWidth();
                else
                  lineWidth /= scale;

//                if (fontSizeScale != 1.0) {
//                  ctx.scale(fontSizeScale, fontSizeScale);
//                  lineWidth /= fontSizeScale;
//                }
//
//                ctx.lineWidth = lineWidth;

                if (glyphs) {
                    vOffset = getBaselineOffset(font, text, "normal normal " + (fontSize * scale / fontSizeScale) + "px '" + fontName + "'", fontSize * scale / fontSizeScale);

                    ctx.scale(1/scale, 1/scale);
                    ctx.translate(0, vOffset);

                    setVendorStyleAttribute(outerElemStyle, "transform", "matrix(" + [
                        sanitizeCSSValue(ctx.mozCurrentTransform[0]),
                        sanitizeCSSValue(ctx.mozCurrentTransform[1]),
                        sanitizeCSSValue(ctx.mozCurrentTransform[2]),
                        sanitizeCSSValue(ctx.mozCurrentTransform[3]),
                        sanitizeCSSValue(roundPosition ? roundValue(ctx.mozCurrentTransform[4], roundingPrecission) : ctx.mozCurrentTransform[4]),
                        sanitizeCSSValue(roundPosition ? roundValue(ctx.mozCurrentTransform[5], roundingPrecission) : ctx.mozCurrentTransform[5])
                    ] + ")");
                }

                outerElemStyle.fontFamily = "'" + fontName + "', " + fallbackName;
                outerElemStyle.fontSize = (fontSize * scale / fontSizeScale) + "px";
                outerElemStyle.color = current.fillColor;

                for (i = 0; i < dataLen; i ++) {
                    var value = data[i],
                        i, j, l;

                    if (typeof value === "number") {
                        // space
                        var spacingLength = - value * fontSize * current.textHScale * 0.001 * current.fontDirection;
//                        if (vertical) {
//                          current.y += spacingLength;
//                        } else {
                          x += spacingLength;
//                        }
                    } else {
                        // character
                        if (isSpacedText) {
                            glyphs = font.charsToGlyphs(value);
                            l = glyphs.length;
                            j = 0;

                            if (vOffset === null) {
                                vOffset = getBaselineOffset(font, text, "normal normal " + (fontSize * scale / fontSizeScale) + "px '" + fontName + "'", fontSize * scale / fontSizeScale);
                                ctx.scale(1/scale, 1/scale);
                                ctx.translate(0, vOffset);

                                setVendorStyleAttribute(outerElemStyle, "transform", "matrix(" + [
                                    ctx.mozCurrentTransform[0],
                                    ctx.mozCurrentTransform[1],
                                    ctx.mozCurrentTransform[2],
                                    ctx.mozCurrentTransform[3],
                                    roundPosition ? roundValue(ctx.mozCurrentTransform[4], roundingPrecission) : ctx.mozCurrentTransform[4],
                                    roundPosition ? roundValue(ctx.mozCurrentTransform[5], roundingPrecission) : ctx.mozCurrentTransform[5]
                                ] + ")");
                            }
                        } else {
                            j = i;
                            l = j + 1;
                        }

                        for (; j < l; j ++) {
                            var glyph = glyphs[j];

                            if (glyph && !glyph.disabled) {
//                                console.log("==========> CHAR:", glyph.fontChar, "(" + glyph.unicode + ")", glyph.fontChar.charCodeAt(0));
                                var vmetric = glyph.vmetric || font.defaultVMetrics,
                                    width = vmetric ? -vmetric[0] : glyph.width,
                                    charWidth = width * fontSize * current.fontMatrix[0] + charSpacing * current.fontDirection,
                                    innerElem = document.createElement("span"),
                                    innerElemStyle = innerElem.style,
                                    roundScaledX = roundValue(x * scale, 0),
                                    character = font.remaped ? glyph.unicode : glyph.fontChar;

                                if (character === ' ' || character.charCodeAt(0) === 0) {
                                    innerElem.innerHTML = "&nbsp;";
                                } else {
//                                    if (character.charCodeAt(0) === 57357) {
//                                        innerElem.innerHTML = "&#xfb01;"
//                                    } else {
                                        innerElem.appendChild(document.createTextNode(character));
//                                    }
                                }

                                if (previousSpan) {
                                    innerElemStyle.position = "relative";
                                    setVendorStyleAttribute(innerElemStyle, "transform", "translate(" + (roundPosition ? roundValue((x - previousX) * scale, roundingPrecission) : (x - previousX) * scale) + "px, 0)");
                                    previousSpan.appendChild(innerElem);
                                } else {
                                    setVendorStyleAttribute(innerElemStyle, "transform", "translate(" + (roundPosition ? roundValue(x * scale, roundingPrecission) : x * scale) + "px, 0)");
                                    outerElem.appendChild(innerElem);
                                }
//                                previousSpan = innerElem;
                                previousRoundScaledX = roundScaledX;
                                previousX = x;

                                x += charWidth;
                            } else {
//                                console.log("==========> * word separator *");
                                x += fontDirection * wordSpacing;
//                                previousSpan = null;
                                previousX = x
                            }
                        }
                    }
                }

                this.owner._rootNodeStack[0].appendChild(outerElem);
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\n"));

                } catch (ex) {
                    console.log("========== showText ERROR:", ex.message, ex.stack);
                }
                console.log("========== showText end");
                ctx.restore();
            }
        }
    },

    _preProcessor: {
        value: {
            _svg: null,
            _svgTransform: null,
            _svgElement:null,
            _svgHasDrawnElements: false,
            _svgElementDrawn: false,

            beginLayout: function() {
                console.log("GRAPH:beginLayout");
            },

            endLayout: function() {
                console.log("GRAPH:endLayout");
                this.endSVG();
            },

            startSVG: function(context, type) {
                var ctx = context.ctx,
                    transform = ctx.mozCurrentTransform;

                type = type || "path";

                if (!this._svg) {
//                    console.log("********* START SVG **********");
                    var gElem = document.createElementNS(xmlns, "g");

                    this._svg = document.createElementNS(xmlns, "svg");
                    this._svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                    this._svg.appendChild(gElem);
                    this._svgHasDrawnElements = false;
                }

//                if (this._svgElement && (this._svgElement.tagName !== type || this._svgElement.tagName == "rect")) {
//                    // JFD TODO: how do we fill of stroke the current element?
//                    this._svgElement = null;
//                }

                if (!this._svgElement) {
                    this._svgTransform = transform.slice(0, 6);
                    this._svgElement = document.createElementNS(xmlns, type || "path");
                    this._svg.firstChild.appendChild(this._svgElement);
                    this._svgElementDrawn = false;
                }
            },

            endSVG: function(context) {
                if (this._svg) {
//                    console.log("********* END SVG **********");
                    var current = context.current,
                        ctx = context.ctx,
                        gElem = this._svg.firstChild,
                        rect;

                    if (this._svgHasDrawnElements && gElem.childNodes.length !== 0) {
                        var transform = this._svgTransform.slice(), // make a copy as we are going to modify it
                            xScale = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]),
                            yScale = Math.sqrt(transform[2] * transform[2] + transform[3] * transform[3]),
                            xExtraSpace = 0,
                            yExtraSpace = 0;

                        this.owner._rootNodeStack[0].appendChild(this._svg);
                        this.owner._rootNodeStack[0].appendChild(document.createTextNode("\n"));

                        rect = this._svg.getBBox();
//                        console.log("GRAPHIC DIM-1:", this._svg.getBoundingClientRect(), this._svg.getBBox());

                        if (typeof gElem.style.stroke === "string" && gElem.style.stroke !== "" && gElem.style.stroke !== "none") {
                             // The BBox does not account for the space of the path's stoke

                            var xLineWidth = current.lineWidth * xScale,
                                yLineWidth = current.lineWidth * yScale;

                            if (xLineWidth === 0) {
                                xLineWidth = context.getSinglePixelWidth();
                            }
                            if (yLineWidth === 0) {
                                yLineWidth = context.getSinglePixelWidth();
                            }
                            xExtraSpace = Math.ceil(Math.max(xLineWidth / 2, ctx.miterLimit * xScale));
                            yExtraSpace = Math.ceil(Math.max(yLineWidth / 2, ctx.miterLimit * yScale));
                        }

                        this._svg.style.width = Math.ceil(rect.width + xExtraSpace) + "px";
                        this._svg.style.height = Math.ceil(rect.height + yExtraSpace) + "px";

                        transform[0] = sanitizeCSSValue(transform[0]);
                        transform[1] = sanitizeCSSValue(transform[1]);
                        transform[2] = sanitizeCSSValue(transform[2]);
                        transform[3] = sanitizeCSSValue(transform[3]);
                        transform[4] = sanitizeCSSValue(roundValue(transform[4] ? transform[4] - (-rect.x * this.scale) - (xExtraSpace / 2) : (rect.x * this.scale) - (xExtraSpace / 2), 2));
                        transform[5] = sanitizeCSSValue(roundValue(transform[5] - (rect.y * this.scale) + (yExtraSpace / 2), 2));

                        setVendorStyleAttribute(this._svg.style, "transform", "matrix(" + transform.join(",") + ")");

                        xExtraSpace /= xScale * 2;
                        yExtraSpace /= yScale * -2;
                        setVendorStyleAttribute(gElem.style, "transform", "translate(" + sanitizeCSSValue(roundValue(-rect.x + xExtraSpace, 2)) + "px, " +
                            sanitizeCSSValue(roundValue(-rect.y - yExtraSpace, 2)) + "px)");

                        console.log(this._svg);
                    }

                    this._svg = null;
                    this._svgElement = null;
                }
            },

            appendDataToPath: function(data) {
                var d = "";

                if (this._svgElement.hasAttribute("d")) {
                    d = this._svgElement.getAttribute("d");
                }
                this._svgElement.setAttribute("d", d + data);
            },

            moveTo: function(context, x, y) {
                this.startSVG(context);
                this.appendDataToPath("M" + x + "," + y);
            },

            lineTo: function(context, x, y) {
                this.startSVG(context);
                this.appendDataToPath("L" + x + "," + y);
            },

            curveTo: function(context, x1, y1, x2, y2, x3, y3) {
                this.startSVG(context);
                this.appendDataToPath("C" + x1 + "," + y1+ "," + x2+ "," + y2+ "," + x3+ "," + y3);
            },

            curveTo2: function(context, x2, y2, x3, y3) {
                this.startSVG(context);
                this.appendDataToPath("S" + x2+ "," + y2+ "," + x3+ "," + y3);
            },

            curveTo3: function(context, x1, y1, x3, y3) {
                this.startSVG(context);
                this.appendDataToPath("Q" + x1 + "," + y1+ "," + x3+ "," + y3);
            },

            closePath: function(context) {
                this.startSVG(context);
                this.appendDataToPath("Z");
            },

            rectangle: function(context, x, y, width, height) {
                this.startSVG(context);
                // We cannot use an SVG rect has the current patch might not be completed yet, instead, draw the rect as a path
                this.appendDataToPath("M" + x + "," + y + "L" + (x + width) + "," + y + "L" + (x + width) + "," + (y + height) +
                    "L" + x + "," + (y + height) + "L" + x + "," + y);
            },

            fill: function(context, consumePath, fillRule) {
                // fill must be called before stroke!
                var current = context.current,
                    ctx = context.ctx,
                    gElem = this._svgElement.parentNode;

                if (consumePath === undefined) {
                    consumePath = true;
                }

                gElem.style.fill = current.fillColor;
                gElem.style.stoke = "none";             // In case we do not call stoke after calling fill
                if (fillRule !== undefined) {
                    gElem.style.fileRule = fillRule;
                }
                this._svgHasDrawnElements = true;
                this._svgElementDrawn = true;

                if (consumePath === true) {
                    this.endSVG(context);
                }
            },

            stroke: function(context) {
                 // fill must be called before stroke!
                var current = context.current,
                    ctx = context.ctx,
                    gElem = this._svgElement.parentNode,
                    lineWidth = current.lineWidth;

                if (lineWidth === 0) {
                    lineWidth = context.getSinglePixelWidth();
                }

                if (gElem.style.fill === undefined || gElem.style.fill === "") {
                    gElem.style.fill = "none";
                }

                gElem.style.stroke = current.strokeColor;
                gElem.style.strokeWidth = lineWidth;
                gElem.style.strokeLinecap = ctx.lineCap;
                gElem.style.strokeLinejoin = ctx.lineJoin;
                gElem.style.strokeMiterlimit = ctx.miterLimit;

                this._svgHasDrawnElements = true;
                this._svgElementDrawn = true;
                this.endSVG(context);
            },

            closeStroke: function(context) {
                this.startSVG(context);
                this.appendDataToPath("Z");
                this.stroke(context);
            },

            eoFill: function(context) {
                this.fill(context, true, "evenodd");
            },

            closeFill: function(context) {
                this.startSVG(context);
                this.appendDataToPath("Z");
                this.fill(context, true);
            },

            fillStroke: function(context, fillRule) {
                this.fill(context, false, fillRule);
                this.stroke(context);
            },

            eoFillStroke: function(context) {
                this.fillStroke(context, "evenodd");
            },

            closeFillStroke: function(context) {
                this.startSVG(context);
                this.appendDataToPath("Z");
                this.fillStroke(context);
            },

            eoCloseFillStroke: function(context) {
                this.fillStroke(context, "evenodd");
            },

            clip: function(context, clipRule) {
                console.log("--> graphic clipping not yet supported");
                this.endSVG(context);
            },

            eoClip: function(context) {
                this.clip(context, "evenodd");
            },

            endPath: function(context) {
                if (this._svgElement) {
                    if (!this._svgHasDrawnElements) {
                        this._svgElement.parentNode.removeChild(this._svgElement);
                    }
                    this._svgElement = null;
                }
            },

            showText: function(context, str) {
                this.owner._textLayer.showText(context, str);
            },

            showSpacedText: function(context, arr) {
                this.owner._textLayer.showText(context, arr);
            },

            beginGroup: function(context, group) {
                this.owner._rootNodeStack.unshift(document.createElement("div"));
            },

            endGroup: function(context, group) {
                // JFD TODO: the positionning of the div seems to be bogus (check farm.pdf, page 3)
                var groupElem = this.owner._rootNodeStack.shift(),
                    groupElemStyle = groupElem.style,
                    ctx = context.groupStack[context.groupStack.length - 1],
                    transform;

                ctx.save();
                    ctx.scale(1.0 / this.scale, -1.0 / this.scale);
                    transform = ctx.mozCurrentTransform.slice(0, 6);
                    transform[4] /= this.scale;
                    transform[5] = (ctx.canvas.height - transform[5]) / this.scale;
                ctx.restore();

                groupElem.classList.add("group");
                setVendorStyleAttribute(groupElemStyle, "transform", "matrix(" + [
                    sanitizeCSSValue(transform[0]),
                    sanitizeCSSValue(transform[1]),
                    sanitizeCSSValue(transform[2]),
                    sanitizeCSSValue(transform[3]),
                    sanitizeCSSValue(roundValue(transform[4], 0)),
                    sanitizeCSSValue(roundValue(transform[5], 0))
                ] + ")");

                this.owner._rootNodeStack[0].appendChild(groupElem);
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\n"));
                console.log("---INSERTING NEW GROUP:", groupElem)
            }
        }
    }

});
