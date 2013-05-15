var Montage = require("montage/core/core").Montage,
    Promise = require("montage/core/promise").Promise,
    PDF2HTMLCache = require("./pdf2html-cache.js").PDF2HTMLCache;


var origin_time = new Date().getTime();
var timestamp = function() {return "[" + ((new Date().getTime() - origin_time) % 600000) / 1000 + "] "};

var renderingMode = 3;

var xmlns = "http://www.w3.org/2000/svg";


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
function getBaselineOffset(glyphs, font, height, rootElem) {
    if (_baselineOffsetCache[font] !== undefined) {
        return _baselineOffsetCache[font];
    }

    // Create a temporary canvas
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

    for (var i = 0; i < glyphs.length; i ++) {
        var character = glyphs[i] ? glyphs[i].fontChar : null;

        if (character === null) {
            continue;
        }

        ctx.save();
        ctx.font = font;
        charWidth = ctx.measureText(character).width;
        canvas.width = charWidth;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = font;     // the context was reset when resizing the canvas!
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
                _baselineOffsetCache[font] = baseline - topline;

                console.log("baseline offset:", baseline - topline, (baseline -topline) / height);
                return baseline - topline;
            }
        }

        ctx.restore();
    }

    console.log("#error: cannot calculate the baseline offset!");
    return -1;
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

    getDocument: {
        value: function(path) {
            var thisRef = this,
                defered = Promise.defer();

            // note: PDFJS uses it own variation of promise
            PDFJS.getDocument(path).then(
                function(pdf) {
                    thisRef._pdf = pdf;
                    pdf.cssFonts = {};  // Setup a cache for the fonts

                    // Setup local storage for images
                    Montage.create(PDF2HTMLCache).initialize(path, pdf).then(function(cache) {
                            PDFJS.objectsCache = cache;
                            defered.resolve(pdf)
                        }, function(error) {
                            console.warn(error);
                            defered.resolve(pdf)
                        }
                    ).done()
                },
                function(exception) {
                    defered.reject(exception)
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
            var thisRef = this,
                defered = Promise.defer(),
                renderContext,
                ctx = canvas.getContext('2d');

             //reset the canvas
//            ctx.setTransform(1,0,0,1,0,0);
//            ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
//            ctx.save();

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
                        console.log("IMAGE:", image.src);
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
                thisRef._preProcessor.endSVG();
                callback();
            }

            page.render(renderContext).then(
                function() {
                    console.log("...success");
                    page.destroy();
                    defered.resolve();
                },
                function(exception) {
                    console.log("...error:", exception);
                    page.destroy();
                    defered.reject(exception)
                },
                function(progress) {
                    console.log("...renderPage progress:", progress);
                    defered.notify(progress);
                });

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
                    canvasHeight = context.ctx.canvas.height,
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
                        imageCanvas = createScratchCanvas(width, height);

                    position = context.getCanvasPosition(0, -height);
                    transform[4] = position[0];
                    transform[5] = position[1];


                    if (typeof ImageData !== 'undefined' && imageData instanceof ImageData) {
                        imageCanvas.putImageData(imageData, 0, 0);
                    } else {
                      context.putBinaryImageData.call(context, imageCanvas.getContext('2d'), imageData.data, width, height);
                    }

                    elem = document.createElement("img");
                    imageBlob = blobFromDataURL(imageCanvas.toDataURL("image/png"));
                }

                if (imageBlob) {
                    elem.src = URL.createObjectURL(imageBlob);
                }
                elem.style.position = "absolute";
                elem.style.webkitTransformOrigin = "0 0";
                elem.style.webkitTransform = "matrix(" + sanitizeCSSValue(transform[0]) + ", " + sanitizeCSSValue(transform[1]) + ", " +
                    sanitizeCSSValue(transform[2]) + ", " + sanitizeCSSValue(transform[3]) + ", " + sanitizeCSSValue(transform[4]) + ", " + sanitizeCSSValue(transform[5]) + ")";

                this.owner._rootNodeStack[0].appendChild(elem);
            }
        }
    },

    _textLayer: {
        value: {
//            beginLayout: function() {
//                console.log("TEXT:beginLayout")
//            },
//            endLayout: function() {
//                console.log("TEXT:endLayout")
//            },
//            appendText: function(object, text, fontObject, fontStyle) {
//                if (renderingMode !== 1) return;
//
//                console.log("  TEXT:appendText", text, fontObject, fontStyle);
//
//                var fontName = object.fontName;
//                if (this.owner._pdf.cssFonts[fontName] == undefined) {
//                    this.owner._pdf.cssFonts[fontName] = this.page.commonObjs.getData(fontName).bindDOM();
////  console.log("*** FONT:", fontName, this.page.commonObjs.getData(fontName))
//
//                    var style = document.createElement("style");
//                    style.type = "text/css";
//                    style.innerText = this.owner._pdf.cssFonts[fontName];
//                    this.owner._rootNodeStack[0].insertBefore(style, this.owner._rootNodeStack[0].firstChild);
//                }
//
//                var isSpacedText = Array.isArray(text);
//
//                var outerElem = document.createElement("span"),
//                    style = outerElem.style,
//                    fontsize = object.fontSize * object.hScale;
////                    fontsize = object.fontSize * object.transform[0];
//
////                console.log("*** appendText:", object, text, object.transform);
//                style.position = "absolute";
//                style.fontFamily = object.fontName;
//                style.fontSize = fontsize + "px";
//                style.color = fontStyle.color;
//
//                var glyphs = fontObject.charsToGlyphs(text);
//                var vOffset = 0;
//try {
//                vOffset = getBaselineOffset(/*isSpacedText ? text: text.join("")*/glyphs, "normal normal " + style.fontSize + " " + object.fontName, fontsize, this.owner._rootNodeStack[0]);
//} catch(ex) {console.log("### ERROR GETTING BASELINE:", ex)}
//                style.top = (object.y + vOffset) + "px";     // JFD: What about the correct base line!
//                style.left = object.x + "px";
//
//
////                style.color = "rgb(241, 9, 9)";
////                style.fontSize = object.fontSize + "px";
////                style.webkitTransformOrigin + "0 0";
////                style.webkitTransform = "matrix(" + sanitizeCSSValue(transform[0]) + ", " + sanitizeCSSValue(transform[1]) + ", " +
////                    sanitizeCSSValue(transform[2]) + ", " + sanitizeCSSValue(transform[3]) + ", " + sanitizeCSSValue(transform[4]) + ", " + sanitizeCSSValue(transform[5]) + ")";
//
////                if (isSpacedText) {
////                    this.owner._rootNodeStack[0].appendChild(outerElem);
////
////                    var spacing = 0;
////                    for (var i in text) {
////                        var data = text[i];
////                        if (typeof data === "string") {
////                            var innerElem = document.createElement("span");
////
////                            var glyphs = fontObject.charsToGlyphs(data);
////                            console.log("glyphs=", glyphs);
////
////                            data = ""
////                            for (i in glyphs) {
////                                if (glyphs[i]) {
////                                    data += glyphs[i].fontChar;
////                                }
////                            }
////
////                            innerElem.innerHTML = data.replace(/ /g, "&nbsp;");
////                            var roundedSpacing = Math.round(spacing);
////                            if (roundedSpacing != 0) {
////                                innerElem.style.marginLeft = roundedSpacing + "px";
////                                spacing -= roundedSpacing;
////                                spacing = 0;
////                            }
////                            outerElem.appendChild(innerElem);
////                        } else if (typeof data === "number") {
////                            spacing += - data * object.fontSize * object.textHScale * this.scale;   //JFD TODO: the scale factor should be applied by the BE
////                        }
////                    }
////                } else {
////                    var glyphs = fontObject.charsToGlyphs(text);
//
//                    text = ""
//                    for (i in glyphs) {
//                        if (glyphs[i]) {
//                            text += glyphs[i].fontChar;
//                        }
//                    }
//
//                    outerElem.innerHTML = text.replace(/ /g, "&nbsp;");
//                    this.owner._rootNodeStack[0].appendChild(outerElem);
//                    console.log(outerElem)
////                }
//            },
//
//            appendCharacter: function(character, geometry, offsetX, offsetY, params) {
//                if (renderingMode !== 2) return;
//
//                console.log("append char:", character, geometry, geometry.x, offsetX, params)
//
//                var fontName = geometry.fontName;
//                if (this.owner._pdf.cssFonts[fontName] == undefined) {
//                    this.owner._pdf.cssFonts[fontName] = this.page.commonObjs.getData(fontName).bindDOM();
//
//                    var style = document.createElement("style");
//                    style.type = "text/css";
//                    style.innerText = this.owner._pdf.cssFonts[fontName];
//                    this.owner._rootNodeStack[0].insertBefore(style, this.owner._rootNodeStack[0].firstChild);
//                }
//
//                var outerElem = document.createElement("span"),
//                    style = outerElem.style,
//                    fontsize = geometry.fontSize * geometry.hScale;
//
//                style.position = "absolute";
//                style.fontFamily = geometry.fontName;
//                style.fontSize = fontsize + "px";
//                style.color = params.color;
//
//                var vOffset = 0;
//                try {
//                    vOffset = getBaselineOffset(character, "normal normal " + style.fontSize + " " + geometry.fontName, fontsize, this.owner._rootNodeStack[0]);
//                } catch(ex) {console.log("### ERROR GETTING BASELINE:", ex)}
//                style.top = (/*geometry.y + */offsetY + vOffset) + "px";
//                style.left = (/*geometry.x + */offsetX) + "px";
//
//                outerElem.innerHTML = character.replace(/ /g, "&nbsp;");
//                this.owner._rootNodeStack[0].appendChild(outerElem);
//            },

            showText: function(context, text) {
                if (renderingMode < 3) return;

                var isSpacedText = typeof data !== "string",
                    current = context.current,
                    ctx = context.ctx,
                    font = current.font,
                    fontName = font.loadedName,
                    fontSize = current.fontSize,
                    fontSizeScale = /*current.fontSizeScale*/ 1.0,
                    charSpacing = current.charSpacing,
                    wordSpacing = current.wordSpacing,
                    fontDirection = current.fontDirection,
                    outerElem = document.createElement("span"),
                    outerElemStyle = outerElem.style,
                    previousSpan = null,
                    vOffset = null,
                    glyphs = isSpacedText ? null : font.charsToGlyphs(data),
                    data = isSpacedText ? text : glyphs,
                    dataLen = data.length,
                    x = 0,
                    previousX = 0,
                    previousRoundScaledX = 0,
                    roundPosition = (renderingMode === 4),
                    i;

                console.log("========== showText:", text, fontSize);

                ctx.save();
                context.applyTextTransforms();

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
                    vOffset = getBaselineOffset(glyphs, "normal normal " + (scale / fontSizeScale) + "px " + fontName, (scale / fontSizeScale));
//                    outerElemStyle.webkitTransformOrigin = "0 " + (vOffset / scale * -1) + "px";
                    console.log("transform #1", ctx.mozCurrentTransform)

                    ctx.scale(1/scale, 1/scale);
                    ctx.translate(0, vOffset);
//                    outerElemStyle.webkitTransform = "matrix(" + ctx.mozCurrentTransform.join(", ") + ")";
                    console.log("transform #2", ctx.mozCurrentTransform)

                    outerElemStyle.webkitTransform = "matrix(" + [
                        sanitizeCSSValue(ctx.mozCurrentTransform[0]),
                        sanitizeCSSValue(ctx.mozCurrentTransform[1]),
                        sanitizeCSSValue(ctx.mozCurrentTransform[2]),
                        sanitizeCSSValue(ctx.mozCurrentTransform[3]),
                        sanitizeCSSValue(roundPosition ? roundValue(ctx.mozCurrentTransform[4], 0) : ctx.mozCurrentTransform[4]),
                        sanitizeCSSValue(roundPosition ? roundValue(ctx.mozCurrentTransform[5], 0) : ctx.mozCurrentTransform[5])
                    ] + ")";
                }

//                console.log("========== showText:", current, ctx.mozCurrentTransform, fontSizeScale, scale);

                outerElemStyle.position = "absolute";
                outerElemStyle.webkitTransformOrigin = "0 0";
                outerElemStyle.fontFamily = fontName + ", " + font.fallbackName;
                outerElemStyle.fontSize = scale + "px";
                outerElemStyle.color = current.fillColor;

                for (i = 0; i < dataLen; i ++) {
                    var value = data[i],
                        i, j, l;

                    if (typeof value === "number") {
                        // space
//                        console.log("==========> * spacing *", value);

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
                                vOffset = getBaselineOffset(glyphs, "normal normal " + (scale / fontSizeScale) + "px " + fontName, (scale / fontSizeScale));
                                outerElemStyle.webkitTransformOrigin = "0 " + (roundPosition ? roundValue(vOffset / scale * -1, 0) : vOffset / scale * -1) + "px";
                                ctx.scale(1/scale, 1/scale);
                                ctx.translate(0, vOffset);
                                console.log("scale:", scale, "fontsize:", fontSizeScale);
                                console.log("transform #3", ctx.mozCurrentTransform)

                                outerElemStyle.webkitTransform = "matrix(" + [
                                    ctx.mozCurrentTransform[0],
                                    ctx.mozCurrentTransform[1],
                                    ctx.mozCurrentTransform[2],
                                    ctx.mozCurrentTransform[3],
                                    roundPosition ? roundValue(ctx.mozCurrentTransform[4], 0) : ctx.mozCurrentTransform[4],
                                    roundPosition ? roundValue(ctx.mozCurrentTransform[5], 0) : ctx.mozCurrentTransform[5]
                                ] + ")";
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
                                    roundScaledX = roundValue(x * scale, 0);

//                                innerElemStyle.position = "absolute";
//                                innerElemStyle.webkitTransform = "translate(" + (x * scale) + "px, 0)";
                                if (glyph.fontChar === ' ') {
                                    innerElem.innerHTML = "&nbsp;";
                                } else {
                                    var character = glyph.fontChar;

//                                    if (character.charCodeAt(0) === 57357) {
//                                        innerElem.innerHTML = "&#xfb01;"
//                                    } else {
                                        innerElem.appendChild(document.createTextNode(character));
//                                    }
                                }

                                if (previousSpan) {
                                    innerElemStyle.position = "relative";
                                    innerElemStyle.webkitTransform = "translate(" + (roundPosition ? roundValue((x - previousX) * scale, 0) : (x - previousX) * scale) + "px, 0)";
//                                    innerElemStyle.webkitTransform = "translate(" + (roundScaledX - previousRoundScaledX)  + "px, 0)";
                                    previousSpan.appendChild(innerElem);
                                } else {
//                                    innerElemStyle.backgroundColor = "rgba(128, 128, 128, 0.2)";
                                    innerElemStyle.position = "absolute";
                                    innerElemStyle.webkitTransform = "translate(" + (roundPosition ? roundValue(x * scale, 0) : x * scale) + "px, 0)";
//                                    innerElemStyle.webkitTransform = "translate(" + roundScaledX + "px, 0)";
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

                ctx.restore();
            }
        }
    },

    _preProcessor: {
        value: {
            _svg: null,
            _svgTransform: null,
            _path: null,

            beginLayout: function() {
                console.log("GRAPH:beginLayout");
            },

            endLayout: function() {
                console.log("GRAPH:endLayout");
                this.endSVG();
            },

            startSVG: function(context) {
                var ctx = context.ctx,
                    transform = ctx.mozCurrentTransform;

                if (!this._svg) {
//                    console.log("********* START SVG **********");
                    var gElem = document.createElementNS(xmlns, "g");

                    this._svg = document.createElementNS(xmlns, "svg");
                    this._svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                    this._svg.appendChild(gElem);
                }
                if (!this._path) {
                    this._svgTransform = transform.slice(0, 6);
                    this._path = document.createElementNS(xmlns, "path");
                    this._path.setAttribute("fill", "none");
                    this._path.setAttribute("stroke", "none");
                    this._svg.firstChild.appendChild(this._path);
                }
            },

            endSVG: function() {
                if (this._svg) {
//                    console.log("********* END SVG **********");
                    var gElem = this._svg.firstChild,
                        rect;

                    if (gElem.childNodes.length !== 0) {
                        this.owner._rootNodeStack[0].appendChild(this._svg);
                        rect = this._svg.getBBox();
//                        console.log("GRAPHIC DIM-1:", this._svg.getBoundingClientRect(), this._svg.getBBox());
//                        console.log("GRAPHIC DIM-2:", gElem, gElem.getBoundingClientRect(), gElem.getBBox());
                        this._svg.setAttribute("width", Math.ceil(rect.width - rect.x) + 1);
                        this._svg.setAttribute("height", Math.ceil(rect.height - rect.y) + 1);

                        var xOffset = rect.x < 0 ? rect.x / -1 : 0,
                            yOffset = rect.y < 0 ? rect.y / -1 : 0,
                            transform = this._svgTransform;

                        transform[4] -= xOffset * this.scale;
                        transform[5] += yOffset * this.scale;
                        gElem.setAttribute("transform", "translate(" + xOffset + "," + yOffset + ")");
                        this._svg.setAttribute("style", "position: absolute; -webkit-transform-origin: 0 0; -webkit-transform: matrix("+ transform.join(",") + ")");
                    }

                    this._svg = null;
                    this._path = null;
                }
            },

            appendDataToPath: function(data) {
                var d = "";

                if (this._path.hasAttribute("d")) {
                    d = this._path.getAttribute("d");
                }
                this._path.setAttribute("d", d + data);
            },

            moveTo: function(context, x, y) {
                console.log("----MOVETO:", this, context, x, y)
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
                // JFD TODO: write me!
                // rectangle are mostly used for clipping, in that case we should not create a SVG and therefore we need to filter them out!

                this.startSVG(context);
            },

            stroke: function(context) {
                var current = context.current;

                this._path.setAttribute("stroke", current.strokeColor);
                this.endSVG();
            },

            fill: function(context) {
                var current = context.current;

                console.log("--> graphic fill:", this._svg, this._path);
                this._path.setAttribute("fill", current.fillColor);

                this.endSVG();
            },

            endPath: function(context) {
                // Remove empty path
                if (!this._path.hasAttribute("d")) {
                    this._path.parentNode.removeChild(this._path);
                }
                this._path = null;
            },

            showText: function(context, str) {
                this.owner._textLayer.showText(context, str);
            },

            showSpacedText: function(context, arr) {
                this.owner._textLayer.showText(context, arr);
            },

            beginGroup: function(context, group) {
                console.log("*** beginGroup:", group)
                this.owner._rootNodeStack.unshift(document.createElement("div"));
            },

            endGroup: function(context, group) {
                var groupElem = this.owner._rootNodeStack.shift(),
                    groupElemStyle = groupElem.style,
                    ctx = context.groupStack[context.groupStack.length - 1],
                    transform;

                ctx.save();
                    ctx.scale(1.0 / this.scale, -1.0 / this.scale);
                    transform = ctx.mozCurrentTransform.slice(0, 6);
                console.log(transform)
                    transform[4] /= this.scale;
                    transform[5] = (ctx.canvas.height - transform[5]) / this.scale;
                ctx.restore();

                groupElemStyle.position = "absolute"
                groupElemStyle.webkitTransformOrigin = "0 0";
                groupElemStyle.webkitTransform = "matrix(" + [
                    sanitizeCSSValue(transform[0]),
                    sanitizeCSSValue(transform[1]),
                    sanitizeCSSValue(transform[2]),
                    sanitizeCSSValue(transform[3]),
                    sanitizeCSSValue(roundValue(transform[4], 0)),
                    sanitizeCSSValue(roundValue(transform[5], 0))
                ] + ")";

                this.owner._rootNodeStack[0].appendChild(groupElem);
            }
        }
    }

});
