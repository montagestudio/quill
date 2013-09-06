var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    adaptConnection = require("q-connection/adapt"),
    Connection = require("q-connection");


var xmlns = "http://www.w3.org/2000/svg",
    xmlns_xlink = "http://www.w3.org/1999/xlink"

var RENDERING_MODE = {hybrid: 4, svg: 5};

var LINE_CAP_STYLES = ['butt', 'round', 'square'];
var LINE_JOIN_STYLES = ['miter', 'round', 'bevel'];

var TextRenderingMode = {
  FILL: 0,
  STROKE: 1,
  FILL_STROKE: 2,
  INVISIBLE: 3,
  FILL_ADD_TO_PATH: 4,
  STROKE_ADD_TO_PATH: 5,
  FILL_STROKE_ADD_TO_PATH: 6,
  ADD_TO_PATH: 7,

  FILL_STROKE_MASK: 3,
  ADD_TO_PATH_FLAG: 4
};

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

function checkForTransparency(data) {
    var length = data.length,
        i;

    for (i = 3; i < length; i += 4) {
        if (data[i] !== 255) {
            return true;
        }
    }

    return false;
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

var PDF2HTML = exports.PDF2HTML = Montage.specialize({

    _renderingMode: {
        value: RENDERING_MODE.svg
    },

    renderingMode: {
        /*
            see RENDERING_MODE for allowed values
         */
        get: function() {
            return this._renderingMode;
        },

        set: function(value) {
            if (typeof value === "number" && !isNaN(value)) {
                this._renderingMode = value;
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
                deferred = Promise.defer();

            this.rootDirectory = outputDirectory;

            // note: PDFJS uses it own variation of promise
            PDFJS.getDocument(path).then(
                function(pdf) {
                    self._pdf = pdf;
                    pdf.imagesInfo = {};
                    pdf.cssFonts = {};  // Setup a cache for the fonts
                    deferred.resolve(pdf);
                },
                function(exception) {
                    deferred.reject(exception);
                },
                function(progress) {
                    deferred.notify(progress);
                });

            return deferred.promise;
        }
    },

    getPage: {
        value: function(pdf, pageNumber) {
            var deferred = Promise.defer();

            if (!pdf || !pdf.pdfInfo) {
                deferred.reject(new Error("Invalid pdf document"));
            } else if (!pdf || pageNumber < 1 || pageNumber > pdf.pdfInfo.numPages) {
                deferred.reject(new Error("Invalid page number " + pageNumber));
            } else {
                pdf.getPage(pageNumber).then(
                    function(page) {
                        deferred.resolve(page)
                    },
                    function(exception) {
                        deferred.reject(exception)
                    },
                    function(progress) {
                        console.log("...getPage progress:", progress);
                        deferred.notify(progress);
                    });
            }

            return deferred.promise;
        }
    },

    renderPage: {
        value: function(page, canvas, rootNode, scale, returnOutput) {

            var self = this,
                deferred = Promise.defer(),
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
                if (self.renderingMode == PDF2HTML.RENDERING_MODE.hybrid) {
                    // Emit DOM + SVG
                    this._imageLayer.owner = this;
                    this._imageLayer.page = page;
                    this._imageLayer.scale = scale;
                    renderContext.imageLayer = this._imageLayer;

                    this._textLayer.owner = this;
                    this._textLayer.page = page;
                    this._textLayer.scale = scale;

                    this._preProcessor_DOM.owner = this,
                    this._preProcessor_DOM.page = page;
                    this._preProcessor_DOM.scale = scale;
                    renderContext.preProcessor = this._preProcessor_DOM;
                } else if (self.renderingMode == PDF2HTML.RENDERING_MODE.svg) {
                    // Emit SVG
                    this._preProcessor_SVG.owner = this,
                    this._preProcessor_SVG.page = page;
                    this._preProcessor_SVG.scale = scale;
                    renderContext.preProcessor = this._preProcessor_SVG;
                } else {
                    console.error("Invalid rendering mode:", self.renderingMode);
                }
            }

            renderContext.continueCallback = function(callback) {
                console.log("  >>> next");
                if (renderContext.preProcessor === self._preProcessor_DOM) {
                    self._preProcessor_DOM.endSVG();
                }
                callback();
            }

            try {
                page.render(renderContext).then(
                    function() {
                        console.log("...success");

                        if (returnOutput) {
                            var data,
                                styleNode,
                                style;

                            styleNode = rootNode.getElementsByTagName("style")[0];
                            if (styleNode) {
                                // temporary remove the style from the body
                                styleNode.parentNode.removeChild(styleNode);
                            } else {
                                styleNode = document.createElement("style");
                            }

                            // Add font-face style rules
                            for (var property in self._pdf.cssFonts) {
                              if (self._pdf.cssFonts.hasOwnProperty(property)) {
                                  var fontExpr = new RegExp(property, "g");

                                  styleNode.appendChild(document.createTextNode(self._pdf.cssFonts[property].style + "\n"));
                              }
                            }

                            // Get the style as text
                            style = styleNode.innerHTML;
                            data = rootNode.innerHTML;

                            // Put the style back
                            if (styleNode) {
                                rootNode.insertBefore(styleNode, rootNode.firstChild)
                            }

                            // Convert URL to relative
                            if (PDFJS.objectsCache) {
                                var baseURI = self.rootDirectory,
                                    baseLength = baseURI.length,
                                    sourceURI = "fs://localhost" + PDFJS.objectsCache.folderPath,
                                    sourceLength = sourceURI.length,
                                    replacementURI = "",
                                    searchURI,
                                    i = 0;

                                console.log("--- baseURI:", baseURI)
                                console.log("--- sourceURI:", sourceURI)

                                if (baseURI.charAt(baseLength - 1) === '/') {
                                    baseURI = baseURI.substr(0, baseLength - 1);
                                }
                                if (sourceURI.charAt(sourceLength - 1) === '/') {
                                    sourceURI = sourceURI.substr(0, sourceLength - 1);
                                }

                                baseURI = baseURI.split('/');
                                baseLength = baseURI.length;

                                sourceURI = sourceURI.split('/');
                                sourceLength = sourceURI.length;

                                while (i < baseLength && i < sourceLength) {
                                    if (baseURI[i] !== sourceURI[i])
                                        break;
                                    i ++;
                                }

                                for (var j = i; j < baseLength; j ++) {
                                    replacementURI += "../";
                                }

                                searchURI = sourceURI.slice(0, i).join('/') + '/'

                                var expr = new RegExp(encodeURI(searchURI), "g");
                                data = data.replace(expr, replacementURI);
                                style = style.replace(expr, replacementURI);
                            }

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

                            page.destroy();
                            deferred.resolve({data: data, style: style});
                        } else {
                            page.destroy();
                            deferred.resolve();
                        }
                    },
                    function(exception) {
                        console.log("...error:", exception.message, exception.stack);
                        page.destroy();
                        deferred.reject(exception)
                    },
                    function(progress) {
                        console.log("...renderPage progress:", progress);
                        deferred.notify(progress);
                    });

            } catch(e) {
                console.log("RENDERING ERROR:", e.message, e.stack);
                deferred.reject(e);
            }

            return deferred.promise;
        }
    },

    getOutline: {
        value: function(pdf) {
            var deferred = Promise.defer();

            pdf.getOutline().then(function(outline) {
                if (outline && outline.length > 0) {
                    pdf.getDestinations().then(function(destinations) {
                        // Need to build the pagesRefMap
                        var pagesRefMap = {},
                            pagePromises = [],
                            numPages = pdf.pdfInfo ? pdf.pdfInfo.numPages : 0,
                            pageNum;

                        for (pageNum = 1; pageNum <= numPages; ++ pageNum) {
                            var pagePromise = pdf.getPage(pageNum);

                            pagePromise.then(function(pdfPage) {
                                var pageRef = pdfPage.ref,
                                    refStr = pageRef.num + ' ' + pageRef.gen + ' R';

                                pagesRefMap[refStr] = pdfPage.pageNumber;
                            });
                            pagePromises.push(pagePromise);
                        }

                        PDFJS.Promise.all(pagePromises).then(function() {
                            var _buildOutline = function(items) {
                                var result = [];

                                items.forEach(function(item) {
                                    var dest = item.dest,
                                        entry = {
                                            title: item.title,
                                            bold: item.bold,
                                            italic: item.italic,
                                            color: item.color
                                        };

                                    if (typeof(dest) == "string") {
                                        // Destination redirect
                                        dest = destinations[dest];
                                    }

                                    if (dest instanceof Array && dest.length > 0) {
                                        dest = dest[0].num + " " + dest[0].gen + " R";
                                        entry.pageNumber = pagesRefMap[dest];
                                    }

                                    if (item.items && item.items.length > 0) {
                                        entry.items = _buildOutline(item.items);
                                    }

                                    result.push(entry);
                                });

                                return result;
                            }
                            // Let's build the outline now that we have all the needed pieces
                            deferred.resolve( _buildOutline(outline));
                        });
                    });
                } else {
                    deferred.resolve(null);
                }
            });

            return deferred.promise;
        }
    },

    _rootNodeStack: {
        value: [null]
    },

    _nextElementUID: {
        value: {}
    },

    _getNextElementUID: {
        value: function(type) {
            if (this._nextElementUID[type] === undefined) {
                this._nextElementUID[type] = 1;
            }
            return "" + type + (this._nextElementUID[type] ++);
        }
    },

    _pdf: {
        value: null
    },

    _imageLayer: {
        value: {
            beginLayout: function() {
            },

            endLayout: function() {
            },

            appendImage: function(object) {
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
                        imageCtx = imageCanvas.getContext('2d'),
                        hasTransparency = false;;

                    position = context.getCanvasPosition(0, -height);
                    transform[4] = position[0];
                    transform[5] = position[1];

                    if (typeof ImageData !== 'undefined' && imageData instanceof ImageData) {
                        imageCtx.putImageData(imageData, 0, 0);
                    } else {
                        if (imageData.data) {
                            hasTransparency = checkForTransparency(imageData.data);
                            putBinaryImageData(imageCtx, imageData.data, width, height);
                        } else {
                            console.log("======== MASK:", typeof Element, imageData.tagName)
                            // JFD TODO: this is likely to be a mask which we do not yet support, just ignore for now...
                            return;
                        }
                    }

                    elem = document.createElement("img");
                    imageBlob = blobFromDataURL(imageCanvas.toDataURL(hasTransparency ? "image/png" : "image/jpeg", PDFJS.jpegQuality));
                }

                if (imageBlob) {
                    elem.src = URL.createObjectURL(imageBlob);
                }
                setVendorStyleAttribute(elem.style, "transform", "matrix(" + sanitizeCSSValue(transform[0]) + ", " + sanitizeCSSValue(transform[1]) + ", " +
                    sanitizeCSSValue(transform[2]) + ", " + sanitizeCSSValue(transform[3]) + ", " + sanitizeCSSValue(transform[4]) + ", " + sanitizeCSSValue(transform[5]) + ")");

                this.owner._rootNodeStack[0].appendChild(elem);
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));
            }
        }
    },

    _textLayer: {
        value: {
            beginLayout: function() {
                console.log("TEXT:beginLayout", this.owner)
            },
            endLayout: function() {
                console.log("TEXT:endLayout")
            },

            showText: function(context, text) {
                var self = this,
                    isSpacedText = typeof text !== "string",
                    current = context.current,
                    ctx = context.ctx,
                    font = current.font,
                    fontName = /*font.name || */font.loadedName,
                    fallbackName,
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
                    roundPosition = true,
                    roundingPrecission = 2,
                    i;


                try {

                ctx.save();
                context.applyTextTransforms();

                // Export the font
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
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));

                } catch (ex) {
                    console.log("========== showText ERROR:", ex.message, ex.stack);
                }
                console.log("========== showText end");
                ctx.restore();
            }
        }
    },

    _preProcessor_SVG: {
        value : {
            log: function() {
                var args = [].slice.call(arguments);
                args.unshift("•••SVG•••");
                console.log.apply(console, args);
            },

            _svgElement: null,

            _svgStates: [],
            _svgPath: null,

            _viewBoxHeight: 0,
            _viewBoxWidth: 0,

            beginLayout: function() {
                this.log("beginLayout:", self._svgStates);
                var view = this.page.pageInfo.view.slice(),
                    scale = this.scale;

//                view[2] = roundValue(view[2] - view[0], 0);
//                view[3] = roundValue(view[3] - view[1], 0);;
//                view[0] = view[1] = 0;
                console.log("PAGE:", (view[2] - view[0]) * scale, (view[3] - view[1]) * scale);

                // save the viewBox height, will be needed to flip the coordinate
                this._viewBoxWidth = view[2] - view[0];
                this._viewBoxHeight = view[3] - view[1];

                 // Insert an SVG element and set is at the top group
                var svgElem = this._svgElement = document.createElementNS(xmlns, "svg");
                svgElem.setAttribute("xmlns", xmlns);
                svgElem.setAttribute("xmlns:xlink", xmlns_xlink);
                svgElem.setAttribute("width", roundValue(this._viewBoxWidth * scale, 0));
                svgElem.setAttribute("height", roundValue(this._viewBoxHeight * scale, 0));
                svgElem.setAttribute("viewBox", [0, 0, this._viewBoxWidth, this._viewBoxHeight].join(" "));

                var gElem = document.createElementNS(xmlns, "g");
                gElem.setAttribute("id", "layer_main");

                if (view[0] !== 0 || view[1] !== 0) {
                    gElem.setAttribute("transform", "translate(" + (-view[0]) + "," + view[1] + ")");
                }

                svgElem.appendChild(gElem);

                this.owner._rootNodeStack[0].appendChild(svgElem);
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));
                this.owner._rootNodeStack.unshift(gElem);

                //Reset the element UID generator
                this.owner._nextElementUID = {};

                this._svgPath = null;

                // Initialize the SVG state and save it...
                var initialSVGState = {
                    transform: [1, 0, 0, 1, 0, 0],
                    clippingPath: null,
                    clippingPathMode: null,
                    fill: "#000000",
                    fillAlpha: 1.0,
                    stroke: "#000000",
                    strokeAlpha: 1.0,
                    flatness: 1,                        // ignored at this point
                    lineWidth: 1,
                    lineCap: LINE_CAP_STYLES[0],
                    lineJoin: LINE_JOIN_STYLES[0],
                    miterLimit: 10,
                    lineDash: "",
                    lineDashOffset: 0,

                    //Text States
                    x: 0,
                    y: 0,
                    lineX: 0,
                    lineY: 0,
                    charSpacing: 0,
                    wordSpacing: 0,
                    textHScale: 1,
                    textRenderingMode: TextRenderingMode.FILL,
                    textRise: 0,
                    leading: 0,
                    font: null,
                    fontSize: 0,
                    fontSizeScale: 1,
                    textMatrix: IDENTITY_MATRIX,            // defined in pdf.js/src/utils.js
                    fontMatrix: FONT_IDENTITY_MATRIX,       // defined in pdf.js/src/font.js,
                    fontDirection: 1,
                    rule: "",

                    // clipping
                    rootNode: svgElem,

                    // form
                    paintFormXObjectDepth: 0
                };
                this._svgStates = [initialSVGState];
            },

            endLayout: function() {
                this.log("endLayout:");
            },

            beginMarkedContentProps: function(context, tag, properties) {
                this.log("beginMarkedContentProps", tag, properties);
            },

            endMarkedContentProps: function(context) {
                this.log("endMarkedContentProps");
            },


            // Group

            beginGroup: function(context, group) {
                var currentState = this._svgStates[0],
                    gElem = document.createElementNS(xmlns, "g"),
                    groupID = this.owner._getNextElementUID("group");

                // JFD TODO: set group transform
                gElem.setAttribute("id", groupID);
                if (currentState.fillAlpha !== 1) {
                    gElem.style.opacity = currentState.fillAlpha;
                }

                this.owner._rootNodeStack[0].appendChild(gElem);
                this.owner._rootNodeStack.unshift(gElem);
                console.log("BEGIN GROUP", group, gElem);
            },

            endGroup: function(context, group) {
                this.owner._rootNodeStack.splice(0, 1);
            },


            //Form

            paintFormXObjectBegin: function(context, matrix, bbox) {
                this.save();

                this._svgStates[0].paintFormXObjectDepth ++;

                if (matrix && isArray(matrix) && 6 == matrix.length) {
                    var params = matrix.slice();
                    params.unshift(context);
                    this.transform.apply(this, params);
                }

                if (bbox && isArray(bbox) && 4 == bbox.length) {
                    var width = bbox[2] - bbox[0];
                    var height = bbox[3] - bbox[1];
                    this.rectangle(context, bbox[0], bbox[1], width, height);
                    this.clip(context);
                    this.endPath(context);
                }
            },

            paintFormXObjectEnd: function (context) {
              var depth = this._svgStates[0].paintFormXObjectDepth;
              do {
                this.restore();
                // some pdf don't close all restores inside object
                // closing those for them
              } while (this._svgStates[0].paintFormXObjectDepth >= depth && this._svgStates[0].length > 1);
            },


            // Graphics state
            save: function() {
                var currentState = this._svgStates[0];

                currentState.rootNode = this.owner._rootNodeStack[0];
                this._svgStates.unshift(Object.create(currentState));

//                var prefix = "STATE:";
//                this._svgStates.forEach(function(state) {
//                    console.log(prefix, state.transform ? state.transform.join(", ") : "--none--");
//                    prefix += "  ";
//                })
            },

            restore: function() {
                var currentState,
                    rootNodeStack = this.owner._rootNodeStack;


                if (this._svgStates.length) {
                    this._svgStates.splice(0, 1);
                }

                currentState = this._svgStates[0];
                while (rootNodeStack.length && rootNodeStack[0] !== this._svgElement && rootNodeStack[0] !== currentState.rootNode) {
                    rootNodeStack.splice(0, 1);
                }

//                var prefix = "STATE:";
//                this._svgStates.forEach(function(state) {
//                    console.log(prefix, state.transform ? state.transform.join(", ") : "--none--");
//                    prefix += "  ";
//                })
            },

            transform: function(context, a, b, c, d, e, f) {
                var currentState = this._svgStates[0],
                    m = currentState.transform;

                currentState.transform = [
                  m[0] * a + m[2] * b,
                  m[1] * a + m[3] * b,
                  m[0] * c + m[2] * d,
                  m[1] * c + m[3] * d,
                  m[0] * e + m[2] * f + m[4],
                  m[1] * e + m[3] * f + m[5]
                ];
            },

            setRenderingIntent: function(context, intent) {
                console.warn("rendering intent not yet supported:", intent);
                // TODO set rendering intent?
            },

            setFlatness: function(context, value) {
                console.warn("flatness not yet supported:", value);
                this._svgStates[0].flatness = value;
                // TODO set flatness?
            },

            setLineWidth: function(context, value) {
                this._svgStates[0].lineWidth = value;
            },

            setLineCap: function(context, value) {
                this._svgStates[0].lineCap = LINE_CAP_STYLES[value];
            },

            setLineJoin: function(context, value) {
                this._svgStates[0].lineJoin = LINE_JOIN_STYLES[value];
            },

            setMiterLimit: function(context, value) {
                this._svgStates[0].miterLimit = value;
            },

            setDash: function(context, dashArray, dashPhase) {
                var lineDash = "",
                    delimiter = "";

                // PDF can set a dash width of zero which mean to just draw a dot with a virtual null width line width and
                // other line attribute will give the dash a visual aspect). However SVG wont draw at all a dash of width 0
                // The trick is to set the dash with to a very small value to achieve the same result

                dashArray.forEach(function(value) {
                    lineDash += delimiter + (value === 0 ? 0.001 : value);
                    delimiter = ",";
                });
                this._svgStates[0].lineDash = lineDash;
                this._svgStates[0].lineDashOffset = dashPhase;
            },

            setGState: function(context, states) {
                var self = this;

                states.forEach(function(state) {
                    var key = state[0],
                        value = state[1];

                    switch (key) {
                        case 'LW': self.setLineWidth(context, value);                   break;
                        case 'LC': self.setLineCap(context, value);                     break;
                        case 'LJ': self.setLineJoin(context, value);                    break;
                        case 'ML': self.setMiterLimit(context, value);                  break;
                        case 'D': self.setDash(context, value[0], value[1]);            break;
                        case 'RI': self.setRenderingIntent(context, value);             break;
                        case 'FL': self.setFlatness(context, value);                    break;
                        case 'Font': self.setFont(context, state[1], state[2]);         break;
                        case 'CA':
                            self._svgStates[0].strokeAlpha = state[1];
                            if (state[1] !== 1) {
                                console.warn("stroke alpha not yet supported")
                            }
                            break;
                        case 'ca':
                            self._svgStates[0].fillAlpha = state[1];
                            if (state[1] !== 1) {
                                console.warn("fill alpha not yet supported")
                            }
                            break;
                        case 'BM':
                            if (value && value.name && (value.name !== 'Normal')) {
                                var mode = value.name.replace(/([A-Z])/g, function(c) {
                                    return '-' + c.toLowerCase();
                                }).substring(1);
//                                self.ctx.globalCompositeOperation = mode;
//                                if (self.ctx.globalCompositeOperation !== mode) {
                                    warn('globalCompositeOperation "' + mode + '" is not supported');
//                                }
                            } else {
//                                self.ctx.globalCompositeOperation = 'source-over';
                            }
                            break;
                    }
                });
            },


            // Clipping
            clip: function(context, clipRule) {
                var currentState = this._svgStates[0],
                    transform = currentState.transform.slice(),     // Make a copy, so that we can alter it
                    gElem = document.createElementNS(xmlns, "g"),
                    clipElem = document.createElementNS(xmlns, "clipPath"),
                    pathElem = document.createElementNS(xmlns, "path"),
                    clippingID = this.owner._getNextElementUID("clip");

                pathElem.setAttribute("d", this._svgPath);

                // Flip Y origin
                this.scaleTransform(1, -1, transform);
                transform[5] = this._viewBoxHeight - transform[5];

                pathElem.setAttribute("transform", "matrix(" + transform.join(", ") + ")");

                clipElem.setAttribute("id", clippingID);
                clipElem.appendChild(pathElem);
                this.owner._rootNodeStack[0].appendChild(clipElem);
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));

                if (typeof clipRule == "string") {
                    gElem.setAttribute("clip-rule", clipRule);
                }
                gElem.setAttribute("clip-path", "url(#" + clippingID + ")");
                this.owner._rootNodeStack[0].appendChild(gElem);
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));

                this.owner._rootNodeStack.unshift(gElem);
            },

            eoClip: function(context) {
                this.clip(context, "evenodd");
           },

            endPath: function(context) {
                this._svgPath = null;
            },


            // Shading

            shadingFill: function(context, patternIR) {
                var currentState = this._svgStates[0],
                    transform = currentState.transform.slice(),     // Make a copy, so that we can alter it
                    transformInverse,
                    width = this._viewBoxWidth,
                    height = this._viewBoxHeight;

                // Flip Y origin
                this.scaleTransform(1, -1, transform);
                transform[5] = this._viewBoxHeight - transform[5];

                transformInverse = this.getTransformInverse(transform);

                var bl = this.applyTransform([0, 0], transformInverse);
                var br = this.applyTransform([0, height], transformInverse);
                var ul = this.applyTransform([width, 0], transformInverse);
                var ur = this.applyTransform([width, height], transformInverse);

                var x0 = Math.min(bl[0], br[0], ul[0], ur[0]);
                var y0 = Math.min(bl[1], br[1], ul[1], ur[1]);
                var x1 = Math.max(bl[0], br[0], ul[0], ur[0]);
                var y1 = Math.max(bl[1], br[1], ul[1], ur[1]);

                var gradElem,
                    gradID = this.owner._getNextElementUID("grad");

                // PDF.js does interpret the PDF shading extend parameter as per PDF specs (SECTION 4.6). However, the result is not so good with SVG. Let's just undo it...
                if (patternIR[2].length > 11) {
                    var stop = patternIR[2][1];

                    if (stop[0] === Shadings.SMALL_NUMBER) {
                        // remove the start stop
                        stop[0] = 0;
                        patternIR[2].splice(0, 1);
                    }

                    if (patternIR[2].length == 12) {
                        // remove the end stop
                        stop = patternIR[2][10];
                        if (stop[0] > 0.95) {
                            stop[0] = 1;
                            patternIR[2].splice(11, 1);
                        }
                    }
                }

                if (patternIR[1] == PatternType.AXIAL) {
                    var directionVector = [patternIR[3].slice(), patternIR[4].slice()],
                        p1, p2;
    
                    if (directionVector[0][0] <= directionVector[1][0]) {
                        p1 = directionVector[0][0];
                        p2 = directionVector[1][0];
                    } else {
                        p1 = directionVector[1][0];
                        p2 = directionVector[0][0];
                    }
    
                    // Reverse the user space (must be a better way to solve this issue!)
                    if (p1 > x1 || p2 < x0) {
                        directionVector[0][0] *= -1;
                        directionVector[1][0] *= -1;
                    }
    
                    if (directionVector[0][1] <= directionVector[1][1]) {
                        p1 = directionVector[0][1];
                        p2 = directionVector[1][1];
                    } else {
                        p1 = directionVector[1][1];
                        p2 = directionVector[0][1];
                    }
    
                     // Reverse the user space (must be a better way to solve this issue!)
                    if (p1 > y1 || p2 < y0) {
                        directionVector[0][1] *= -1;
                        directionVector[1][1] *= -1;
                    }
    
                    // PDF coordinates are [(x0 y0) (x1 y1)]
                    gradElem = document.createElementNS(xmlns, "linearGradient");
                    gradElem.setAttribute("x1", directionVector[0][0]);
                    gradElem.setAttribute("y1", directionVector[0][1]);
                    gradElem.setAttribute("x2", directionVector[1][0]);
                    gradElem.setAttribute("y2", directionVector[1][1]);
                } else if (patternIR[1] == PatternType.RADIAL) {
                    // PDF coordinates are [(x0 y0) r0 (x1 y1) r1] which are not quiet the same as SVG's radial gradient
                    // Let's use the center point of the first circle and the radius of the second one to make one big circle, might not be the right assumption!
                    gradElem = document.createElementNS(xmlns, "radialGradient");
                    gradElem.setAttribute("cx", patternIR[3][0]);
                    gradElem.setAttribute("cy", patternIR[3][1]);
                    gradElem.setAttribute("r", patternIR[6] || patternIR[5]);
                } else {
                    console.warn("unsuported shading type:", patternIR[2]);
                    return;
                }

                gradElem.setAttribute("id", gradID);
                gradElem.setAttribute("gradientUnits", "userSpaceOnUse");

                patternIR[2].forEach(function(stopInfo) {
                    var stopElem = document.createElementNS(xmlns, "stop");
                    stopElem.setAttribute("offset", roundValue(stopInfo[0], 3));
                    stopElem.setAttribute("stop-color", stopInfo[1]);
                    gradElem.appendChild(stopElem);
                });
                this.owner._rootNodeStack[0].appendChild(gradElem);

                var rectElem = document.createElementNS(xmlns, "rect");
                rectElem.setAttribute("transform", "matrix(" + transform.join(", ") + ")");
                rectElem.setAttribute("x", roundValue(x0, 5));
                rectElem.setAttribute("y", roundValue(y0, 5));
                rectElem.setAttribute("width", roundValue(x1 - x0));
                rectElem.setAttribute("height", roundValue(y1 - y0));
                rectElem.setAttribute("fill","url(#" + gradID + ")");
                rectElem.setAttribute("stroke","none");
                this.owner._rootNodeStack[0].appendChild(rectElem);
            },


            // Images drawing

            _paintImage: function(context, url, width, height, isAMask) {
                var currentState = this._svgStates[0],
                    scaleX = 1 / width,
                    scaleY = 1 / height,
                    transform = currentState.transform.slice(),     // Make a copy, so that we can alter it
                    geometry,
                    imageElem = document.createElementNS(xmlns, "image");

                // scale transform to reflect image display size (rather that using an 1x1 image size like provided by PDF)
                this.scaleTransform(scaleX, scaleY, transform);

                geometry = this.getGeometry.apply(null, transform)

                // Flip Y origin and adjust x origin (PDF rotate image from the bottom-left corner while SVG does it from the top-left
                transform = [geometry.scaleX, 0, 0, geometry.scaleY, geometry.translateX, this._viewBoxHeight - geometry.translateY];
                this.rotateTransform(geometry.rotateX, transform);
                this.translateTransform(0, - height, transform);

                // Set the image attributes
                imageElem.setAttributeNS(xmlns_xlink, "xlink:href", url);
                imageElem.setAttribute("preserveAspectRatio", "none");

                geometry = this.getGeometry.apply(null, transform);
                if (isAMask) {
                    var maskElem = document.createElementNS(xmlns, "mask"),
                        rectElem = document.createElementNS(xmlns, "rect"),
                        maskID = this.owner._getNextElementUID("mask");

                    maskElem.setAttribute("id", maskID);
                    maskElem.appendChild(imageElem);

                    imageElem.setAttribute("x", 0);
                    imageElem.setAttribute("y", 0);
                    imageElem.setAttribute("width", width);
                    imageElem.setAttribute("height", height);

                    rectElem.setAttribute("x", 0);
                    rectElem.setAttribute("y", 0);
                    rectElem.setAttribute("width", width);
                    rectElem.setAttribute("height", height);
                    rectElem.setAttribute("transform", "matrix(" + transform.join(", ") + ")");
                    rectElem.setAttribute("mask", "url(#" + maskID + ")");
                    rectElem.style.fill = context.current.fillColor;
                    // JFD TODO: check if the canvas color already include the alpha information!
                    if (currentState.fillAlpha !== 1) {
                        rectElem.style.opacity = currentState.fillAlpha;
                    }
                    rectElem.style.stroke = "none";

                    this.owner._rootNodeStack[0].appendChild(maskElem);
                    this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));
                    this.owner._rootNodeStack[0].appendChild(rectElem);
                } else {
                    if (roundValue(geometry.rotateX, 5) !== 0 || roundValue(geometry.rotateY, 5) !== 0 ||
                            geometry.scaleX < 0 || geometry.scaleY < 0) {
                        imageElem.setAttribute("x", 0);
                        imageElem.setAttribute("y", 0);
                        imageElem.setAttribute("width", width);
                        imageElem.setAttribute("height", height);
                        imageElem.setAttribute("transform", "matrix(" + transform.join(", ") + ")");
                    } else {
                        imageElem.setAttribute("x", roundValue(geometry.translateX, 5));
                        imageElem.setAttribute("y", roundValue(geometry.translateY, 5));
                        imageElem.setAttribute("width", roundValue(width * geometry.scaleX, 5));
                        imageElem.setAttribute("height", roundValue(height * geometry.scaleY, 5));
                    }

                    this.owner._rootNodeStack[0].appendChild(imageElem);
                }

                if (!this.owner._pdf.imagesInfo[url]) {
                    this.owner._pdf.imagesInfo[url] = {
                        width: width,
                        height: height,
                        usage: []
                    }
                }

                this.owner._pdf.imagesInfo[url].usage.push({
                    page: this.page.pageNumber,
                    width: roundValue(Math.abs(width * geometry.scaleX * this.scale), 0),
                    height: roundValue(Math.abs(height * geometry.scaleY * this.scale), 0)
                })

                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));
            },

            paintJpegXObject: function(context, objId, w, h) {
                var object = context.objs.get(objId);

                if (!object) {
                    error('Dependent image isn\'t ready yet');
                }
                this._paintImage(context, object.src, w, h);
            },

            paintImageXObject: function(context, objId, w, h) {
                var object = context.objs.get(objId);

                if (!object) {
                    error('Dependent image isn\'t ready yet');
                }

                if (object instanceof Image) {
                    this.paintJpegXObject(context, objId, w, h);
                } else {
                    this.paintInlineImageXObject(context, object, true);
                }
            },

            paintInlineImageXObject: function(context, object, useBlobURL, isAMask) {
                var imageData = object.data,
                    width = object.width,
                    height = object.height,
                    imageCanvas = createScratchCanvas(width, height),
                    imageCtx = imageCanvas.getContext('2d'),
                    hasTransparency = false;

                // JFD TODO: we should recycle the canvas rather that creating a new one each time!

                putBinaryImageData(imageCtx, imageData, width, height);
                hasTransparency = checkForTransparency(imageData);

                if (useBlobURL) {
                    // Add image as blob URL
                    var imageBlob = blobFromDataURL(imageCanvas.toDataURL(hasTransparency ? "image/png" : "image/jpeg", PDFJS.jpegQuality));
                    this._paintImage(context, URL.createObjectURL(imageBlob), width, height, isAMask);
                } else {
                    // Add image as data URL
                    this._paintImage(context, imageCanvas.toDataURL(hasTransparency ? "image/png" : "image/jpeg", PDFJS.jpegQuality), width, height, isAMask);
                }
            },

            paintImageMaskXObject: function(context, object, w, h) {
                if (typeof object === "string") {
                    var object = context.objs.get(object);

                   if (!object) {
                       error('Dependent image isn\'t ready yet');
                   }
                }

                if (object instanceof Image) {
                    this._paintImage(context, object.src, w, h, true);
                } else {
                    console.log("MASK INLINE IMAGE NEED TO BE REVERSED!", object);
                    var data = object.data,
                        dataLength = data.length,
                        invertedData = new Uint8Array(0),
                        i;

                    for (i = 0; i < dataLength - 4; i += 4) {
                        invertedData[i] = 255 - data[i];
                        invertedData[i + 1] = 255 - data[i + 1];
                        invertedData[i + 2] = 255 - data[i + 2];
                    }

                    object.data = invertedData;
                        this.paintInlineImageXObject(context, object, true, true);
                    object.data = data;
                }
            },

            // Text Drawing
            beginText: function(context) {
                // Reset the text metrics
                var current = this._svgStates[0];

                current.textMatrix = IDENTITY_MATRIX;
                current.x = current.lineX = 0;
                current.y = current.lineY = 0;
            },

            endText: function(context) {
            },

            showText: function(context, text) {
                return this.showSpacedText(context, [text]);
            },

            showSpacedText: function(context, data) {
                var current = this._svgStates[0],
                    font = current.font,
                    fontName = font.loadedName,
                    fontSize = current.fontSize,
                    charSpacing = current.charSpacing,
                    wordSpacing = current.wordSpacing,
                    textHScale = current.textHScale,
                    fontDirection = current.fontDirection,
                    glyphs,
                    textElem = document.createElementNS(xmlns, "text"),
                    transform,
                    textMatrix = current.textMatrix.slice(),
                    geometry,
                    scaleFactor,
                    needTransform;

                // Export the font
                if (this.owner._pdf.cssFonts[fontName] == undefined) {
                    if (font.url) {
                        this.owner._pdf.cssFonts[fontName] = {
                            style: '@font-face {font-family: "' + fontName + '"; src: url(\'' + font.url + '\');}',
                            loadedFontName: font.loadedName,
                            fontName: font.name
                        };
                    } else {
                        var fontStyle = font.bindDOM();
                        this.owner._pdf.cssFonts[fontName] = {
                            style: fontStyle
                        }
                    }
                }

                // Compute the text matrix into the current transform
                geometry = this.getGeometry.apply(null, textMatrix);
                scaleFactor = Math.abs(geometry.scaleY);
                fontSize *= scaleFactor;

//                this.scaleTransform(1/scaleFactor, 1/scaleFactor, textMatrix);       // Adjust the scaling to reflect the new computed fontsize
//                console.log("========== showText[SVG]:", data, fontSize, "(" + current.fontSize + ")", charSpacing, wordSpacing, fontDirection, textHScale, textMatrix);

                transform = this.applyTextMatrix(current, textMatrix, this._svgStates[0].transform);
                this.scaleTransform(1/scaleFactor, 1/scaleFactor, transform);       // Adjust the scaling to reflect the new computed fontsize

                // Adjust Y origin
                transform = this.getAdjustedTransform(transform);

                geometry = this.getGeometry.apply(null, transform)
                needTransform = !(geometry.rotateX == 0 && geometry.rotateY == 0 && geometry.scaleX == geometry.scaleY);

                var text = "",
                    index = 0,
                    offsets = [0];

                data.forEach(function(item) {
                    if (typeof item == "number") {
                        // Spacer
                        offsets[index] += - item * current.fontMatrix[0] * fontSize * textHScale;
                        current.x += - item * current.fontMatrix[0] * textHScale;
                    } else if (typeof item == "string") {
                        glyphs = font.charsToGlyphs(item);
                        if (glyphs) {
                            glyphs.forEach(function(glyph) {
                                if (glyph === null) {
                                    //Word delimiter
                                    offsets[index] += wordSpacing * scaleFactor * textHScale;
                                    current.x += wordSpacing * textHScale;
                                } else {
                                    var vmetric = glyph.vmetric || font.defaultVMetrics,
                                        width = vmetric ? -vmetric[0] : glyph.width,
                                        charWidth = (width * current.fontMatrix[0] * fontSize) + (charSpacing * scaleFactor),
                                        character = font.remaped ? glyph.unicode : glyph.fontChar;

                                    character = font.remaped ? glyph.unicode : glyph.fontChar;
                                    if (character.charCodeAt(0) === 0) {
                                        character = " ";
                                    }

                                    if (glyph.disabled) {
                                        // JFD TODO: do we care, what should we do in that case?
                                        console.warn("disabled glyph!");
                                        return;
                                    }
                                    text += character;
                                    offsets[++ index] = charWidth * textHScale;
                                    current.x += charWidth * textHScale / fontSize;
                                }
                            });
                        }
                    } else {
                        console.error("unknown spaced text type:", typeof item, item)
                    }
                });

                // Replace the leading and trailing space characters by a nbsp as SVG will ignore them by default
                text = text.replace(/^ | $/g, "\xA0")   // &nbsp == 0xA0
                // If the string contains continous white spaces, convert them to nbsp, else SVG will concatenate them
                if (text.indexOf("  ") !== -1) {
                    text = text.replace(/ /g, "\xA0")   // &nbsp == 0xA0
                }

                var dx = "",
                    delimiter = "",
                    xPos = needTransform ? 0 : transform[4];

                offsets.pop();     // no need for the last offset

                offsets.forEach(function(offset) {
                    xPos += offset;
                    dx += delimiter + roundValue(xPos, 2);
                    delimiter = ",";
                });
                textElem.setAttribute("x", dx);
                textElem.style.font = current.rule;
                textElem.style.fontSize = fontSize;

                // JFD TODO: remove dependency on canvas for color
                // JFD TODO: add colorspace support
                switch (current.textRenderingMode) {
                    case TextRenderingMode.FILL:
                        textElem.style.fill = context.current.fillColor;
                        textElem.style.stroke = "none";
                        if (current.fillAlpha !== 1) {
                            textElem.style.opacity = current.fillAlpha;
                            // JFD TODO: should we remove that text node all together when alpha = 0?
                        }
                        break;
                    case TextRenderingMode.STROKE:
                        textElem.style.fill = "none";
                        textElem.style.stroke = context.current.strokeColor;
                        if (current.strokeAlpha !== 1) {
                            textElem.style.opacity = current.strokeAlpha;
                            // JFD TODO: should we remove that text node all together when alpha = 0?
                        }
                        break;
                    case TextRenderingMode.FILL_STROKE:
                        textElem.style.fill = context.current.fillColor;
                        textElem.style.stroke = context.current.strokeColor;
                        if (current.strokeAlpha !== 1) {
                            textElem.style.strokeOpacity = current.strokeAlpha;
                        }
                        if (current.fillAlpha !== 1) {
                            textElem.style.fillOpacity = current.fillAlpha;
                        }
                        // JFD TODO: should we remove that text node all together when alpha = 0?
                        break;
                    case TextRenderingMode.INVISIBLE:
                        textElem.style.fill = "none";
                        textElem.style.stroke = "none";
                        // JFD TODO: should we remove that text node all together?
                        break;

                    default:
                        console.warn("unsuported text rendering mode:", current.textRenderingMode)
                }

                if (current.lineWidth !== 1) {
                    console.warn("text line width not yet supported:", current.lineWidth);
                }


                if (needTransform) {
                    textElem.setAttribute("transform", "matrix(" + transform.join(", ") + ")");
                } else {
//                    textElem.setAttribute("x", transform[4]);
                    textElem.setAttribute("y", transform[5]);
                }

                textElem.appendChild(document.createTextNode(text));    // JFD TODO: we need to translate to unicode the text

                this.owner._rootNodeStack[0].appendChild(textElem);
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));
            },

            moveText: function(context, x, y) {
                var current  = this._svgStates[0];

                current.x = current.lineX += x;
                current.y = current.lineY += y;
            },

            nextLine: function(context) {
                var current  = this._svgStates[0];

                this.moveText(context, 0, current.leading);
            },

            setCharSpacing: function(context, spacing) {
                var current  = this._svgStates[0];
                current.charSpacing = spacing;
            },
            setWordSpacing: function(context, spacing) {
                var current  = this._svgStates[0];

                current.wordSpacing = spacing;
            },
            setHScale: function(context, scale) {
                var current  = this._svgStates[0];

                current.textHScale = scale / 100;
            },
            setLeading: function(context, leading) {
                var current  = this._svgStates[0];

                current.leading = -leading;
            },
            setFont: function(context, fontRefName, size) {
                var fontObj = context.commonObjs.get(fontRefName),
                    current = this._svgStates[0];

                if (!fontObj) {
                    error('Can\'t find font for ' + fontRefName);
                }

                current.fontMatrix = fontObj.fontMatrix ? fontObj.fontMatrix : FONT_IDENTITY_MATRIX;

                // A valid matrix needs all main diagonal elements to be non-zero
                if (current.fontMatrix[0] === 0 || current.fontMatrix[3] === 0) {
                    warn('Invalid font matrix for font ' + fontRefName);
                }

                // The spec for Tf (setFont) says that 'size' specifies the font 'scale',
                // and in some docs this can be negative (inverted x-y axes).
                if (size < 0) {
                    size = -size;
                    current.fontDirection = -1;
                } else {
                    current.fontDirection = 1;
                }

                current.font = fontObj;
                current.fontSize = size;

                if (fontObj.coded)
                    return; // we don't need ctx.font for Type3 fonts

                var name = fontObj.loadedName || 'sans-serif';
                var bold = fontObj.black ? (fontObj.bold ? 'bolder' : 'bold') : (fontObj.bold ? 'bold' : 'normal');
                var italic = fontObj.italic ? 'italic' : 'normal';
                var typeface = '"' + name + '", ' + fontObj.fallbackName;

//                // Some font backends cannot handle fonts below certain size.
//                // Keeping the font at minimal size and using the fontSizeScale to change
//                // the current transformation matrix before the fillText/strokeText.
//                // See https://bugzilla.mozilla.org/show_bug.cgi?id=726227
//                var browserFontSize = size >= MIN_FONT_SIZE ? size : MIN_FONT_SIZE;
//                this._svgStates[0].fontSizeScale = browserFontSize != MIN_FONT_SIZE ? 1.0 :
//                                           size / MIN_FONT_SIZE;

                current.rule = italic + ' ' + bold + ' ' + size + 'px ' + typeface;
            },
            setTextRenderingMode: function(context, mode) {
                var current  = this._svgStates[0];

                current.textRenderingMode = mode;
            },

            setTextRise: function(context, rise) {
                var current  = this._svgStates[0];

                current.textRise = rise;
            },

            setLeadingMoveText: function(context, x, y) {
                this.setLeading(context, -y);
                this.moveText(context, x, y);
            },

            setTextMatrix: function(context, a, b, c, d, e, f) {
                var current  = this._svgStates[0];

                current.textMatrix = [a, b, c, d, e, f];

                current.x = current.lineX = 0;
                current.y = current.lineY = 0;
            },


            // Vector drawing

            _appendToCurrentPath: function(data) {
                if (typeof this._svgPath !== "string") {
                    this._svgPath = data;
                } else {
                    this._svgPath += data;
                }
            },

            moveTo: function(context, x, y) {
                this._appendToCurrentPath("M" + x + "," + y);
            },

            lineTo: function(context, x, y) {
                this._appendToCurrentPath("L" + x + "," + y);
            },

            curveTo: function(context, x1, y1, x2, y2, x3, y3) {
                this._appendToCurrentPath("C" + x1 + "," + y1+ "," + x2+ "," + y2+ "," + x3+ "," + y3);
            },

            curveTo2: function(context, x2, y2, x3, y3) {
                this._appendToCurrentPath("S" + x2+ "," + y2+ "," + x3+ "," + y3);
            },

            curveTo3: function(context, x1, y1, x3, y3) {
                this._appendToCurrentPath("Q" + x1 + "," + y1+ "," + x3+ "," + y3);
            },

            closePath: function(context) {
                this._appendToCurrentPath("Z");
            },

            rectangle: function(context, x, y, width, height) {
                // We cannot use an SVG rect has the current patch might not be completed yet, instead, draw the rect as a path
                this._appendToCurrentPath("M" + x + "," + y + "L" + (x + width) + "," + y + "L" + (x + width) + "," + (y + height) +
                    "L" + x + "," + (y + height) + "L" + x + "," + y);
            },

            _fill: function(context, consumePath, fillRule) {
                // note: fill must be called before stroke!
                var current = this._svgStates[0],
                    transform = current.transform.slice(),     // Make a copy, so that we can alter it
                    pathElem = document.createElementNS(xmlns, "path");

                pathElem.setAttribute("d", this._svgPath);
                if (consumePath) {
                    this._svgPath = null;
                }

                // Flip Y origin
                this.scaleTransform(1, -1, transform);
                transform[5] = this._viewBoxHeight - transform[5];

                // JFD TODO: use transform only if needed, else use x/y attribute
                pathElem.setAttribute("transform", "matrix(" + transform.join(", ") + ")");

                if (typeof fillRule == "string") {
                    pathElem.style.fileRule = fillRule;
                }
                pathElem.style.fill = context.current.fillColor;
// JFD TODO: check if the canvas color already include the alpha information!
                if (current.fillAlpha !== 1) {
                    pathElem.style.opacity = current.fillAlpha;
                    // JFD TODO: should we remove that text node all together when alpha = 0?
                    //           but we need to check for any stroke first (consumePath)
                }
                pathElem.style.stoke = "none";             // In case we do not call stoke after calling fill

                this.owner._rootNodeStack[0].appendChild(pathElem);
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));

                return pathElem;
            },

            fill: function(context) {
                this._fill(context, true);
            },

            stroke: function(context, pathElem) {
                 // fill must be called before stroke!

                var current = this._svgStates[0],
                    needNewPathElem = (pathElem === undefined || pathElem === null),
                    transform = current.transform.slice();     // Make a copy, so that we can alter it

                if (needNewPathElem) {
                    pathElem = document.createElementNS(xmlns, "path");
                    pathElem.setAttribute("d", this._svgPath);
                    pathElem.style.fill = "none";

                    // Flip Y origin
                    this.scaleTransform(1, -1, transform);
                    transform[5] = this._viewBoxHeight - transform[5];

                    // JFD TODO: use transform only if needed, else use x/y attribute
                    pathElem.setAttribute("transform", "matrix(" + transform.join(", ") + ")");
                }

                 // Consume the path
                this._svgPath = null;

                // JFD TODO: optimize attribute, only add the one that are not default!
                pathElem.style.stroke = context.current.strokeColor;
// JFD TODO: check if the canvas color already include the alpha information!
                if (current.strokeAlpha !== 1) {
                    pathElem.style.opacity = current.strokeAlpha;
                    // JFD TODO: should we remove that text node all together when alpha = 0?
                    //           but we need to check for any stroke first (consumePath)
                }

                pathElem.style.strokeWidth = current.lineWidth;
                pathElem.style.strokeLinecap = current.lineCap;
                pathElem.style.strokeLinejoin = current.lineJoin;
                pathElem.style.strokeMiterlimit = current.miterLimit;

                if (typeof current.lineDash == "string" && current.lineDash !== "") {
                    pathElem.style.strokeDasharray = current.lineDash;
                    if (current.lineDashOffset) {
                        pathElem.style.strokeDashoffset = current.lineDashOffset;
                    }
                }

                if (needNewPathElem) {
                    this.owner._rootNodeStack[0].appendChild(pathElem);
                    this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));
                }
            },

            closeStroke: function(context) {
                this._appendToCurrentPath("Z");
                this.stroke(context);
            },

            eoFill: function(context) {
                this._fill(context, true, "evenodd");
            },

            closeFill: function(context) {
                this._appendToCurrentPath("Z");
                this._fill(context, true);
            },

            fillStroke: function(context, fillRule) {
                this.stroke(context, this._fill(context, false, fillRule));
            },

            eoFillStroke: function(context) {
                this.fillStroke(context, "evenodd");
            },

            closeFillStroke: function(context) {
                this._appendToCurrentPath("Z");
                this.fillStroke(context);
            },

            eoCloseFillStroke: function(context) {
                this.fillStroke(context, "evenodd");
            },


            // Utilities

            applyTransform: function(p, m) {
              var xt = p[0] * m[0] + p[1] * m[2] + m[4];
              var yt = p[0] * m[1] + p[1] * m[3] + m[5];
              return [xt, yt];
            },

            applyTextMatrix: function (current, textMatrix, transform) {
                var m = transform,
                    a = textMatrix[0], b = textMatrix[1], c = textMatrix[2], d = textMatrix[3], e = textMatrix[4], f = textMatrix[5];

                // Apply text transform
                transform = [
                  m[0] * a + m[2] * b,
                  m[1] * a + m[3] * b,
                  m[0] * c + m[2] * d,
                  m[1] * c + m[3] * d,
                  m[0] * e + m[2] * f + m[4],
                  m[1] * e + m[3] * f + m[5]
                ];

                // translate to current position
                m = transform;
                m[4] = m[0] * current.x + m[2] * (current.y + current.textRise) + m[4];
                m[5] = m[1] * current.x + m[3] * (current.y + current.textRise) + m[5];

                // Adjust for text direction
                if (current.fontDirection > 0) {
                    m[0] = m[0] * current.textHScale;
                    m[1] = m[1] * current.textHScale;
//                    m[2] = m[2] * -1;
//                    m[3] = m[3] * -1;
                } else {
                    console.warn("reverse font direction not tested")
                    m[0] = m[0] * -current.textHScale;
                    m[1] = m[1] * -current.textHScale;
//                    m[2] = m[2] * 1;
//                    m[3] = m[3] * 1;
                }

                return transform;
            },

            scaleTransform: function(x, y, transform) {
                var m = transform;
                m[0] = m[0] * x;
                m[1] = m[1] * x;
                m[2] = m[2] * y;
                m[3] = m[3] * y;
                return m;
            },

            rotateTransform: function (angle, transform) {
                var cosValue = Math.cos(angle);
                var sinValue = Math.sin(angle);

                var m = transform.slice();
                transform[0] = m[0] * cosValue + m[2] * sinValue;
                transform[1] = m[1] * cosValue + m[3] * sinValue;
                transform[2] = m[0] * (-sinValue) + m[2] * cosValue;
                transform[3] = m[1] * (-sinValue) + m[3] * cosValue;
                transform[4] = m[4];
                transform[5] = m[5];

                return transform;
            },

            translateTransform: function(x, y, transform) {
                var m = transform;
                m[4] = m[0] * x + m[2] * y + m[4];
                m[5] = m[1] * x + m[3] * y + m[5];
                return m;
            },

            getTransformInverse: function (transform) {
              // Calculation done using WolframAlpha:
              // http://www.wolframalpha.com/input/?
              //   i=Inverse+{{a%2C+c%2C+e}%2C+{b%2C+d%2C+f}%2C+{0%2C+0%2C+1}}

              var m = transform;
              var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];

              var ad_bc = a * d - b * c;
              var bc_ad = b * c - a * d;

              return [
                d / ad_bc,
                b / bc_ad,
                c / bc_ad,
                a / ad_bc,
                (d * e - c * f) / bc_ad,
                (b * e - a * f) / ad_bc
              ];
            },

            getGeometry: function(a, b, c, d, e, f) {
                var geometry = {},
                    pi = Math.PI;

                geometry.translateX = e;
                geometry.translateY = f;
                geometry.rotateX = Math.atan(c / d);
                geometry.rotateY = Math.atan(-b / a);
                // geometry.rotateXdeg = result.rotateX * 180 / Math.PI;
                // geometry.rotateYdeg = result.rotateY * 180 / Math.PI;

                if (Math.abs(geometry.rotateX) >=  pi / 2 && Math.abs(geometry.rotateX) < pi) {
                    geometry.scaleY = a >= 0 ? Math.sqrt(a * a + b * b) : -Math.sqrt(a * a + b * b);
                    geometry.scaleX = d >= 0 ? Math.sqrt(c * c + d * d) : -Math.sqrt(c * c + d * d);
                } else {
                    geometry.scaleX = a >= 0 ? Math.sqrt(a * a + b * b) : -Math.sqrt(a * a + b * b);
                    geometry.scaleY = d >= 0 ? Math.sqrt(c * c + d * d) : -Math.sqrt(c * c + d * d);
                }

                return geometry;
            },

            getAdjustedTransform: function(transform) {
                var geometry = this.getGeometry.apply(null, transform);

                if (Math.abs(roundValue(geometry.rotateX, 5)) !== Math.abs(roundValue(geometry.rotateY, 5))) {
                    transform[1] *= -1;     // JFD TODO does not sound right, but does work!!!
                    transform[2] *= -1;     // JFD TODO does not sound right, but does work!!!
                    transform[5] = this._viewBoxHeight - transform[5];

                } else {
                    transform = [geometry.scaleX, 0, 0, geometry.scaleY, geometry.translateX, this._viewBoxHeight - geometry.translateY];
                    this.rotateTransform(geometry.rotateX, transform);
                }
                return transform;
            }
        }
    },

    _preProcessor_DOM: {
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
                    this._svg.style.pointerEvents = "none";
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
                        this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));

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
                var current = context.current,
                    groupElem = document.createElement("div");

                // Adjust the opacity
                if (current.fillAlpha != 1) {
                    groupElem.style.opacity = current.fillAlpha;
                }

                this.owner._rootNodeStack.unshift(groupElem);
            },

            endGroup: function(context, group) {
                var groupElem = this.owner._rootNodeStack.shift(),
                    groupElemStyle = groupElem.style,
                    ctx = context.groupStack[context.groupStack.length - 1],
                    transform;

                ctx.save();
                    // Resize the group (but do not reverse the Y axis)
                    ctx.scale(1.0 / this.scale, 1.0 / this.scale);
                    transform = ctx.mozCurrentTransform.slice(0, 6);
                    transform[4] /= this.scale;
                    transform[5] /= this.scale;
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
                this.owner._rootNodeStack[0].appendChild(document.createTextNode("\r\n"));
                console.log("---INSERTING NEW GROUP:", groupElem)
            }
        }
    }

}, {
    RENDERING_MODE: {
        value: RENDERING_MODE
    }
});
