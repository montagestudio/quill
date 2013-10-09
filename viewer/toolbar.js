/*global toolbar,pdf,pdfPage,loadPDFPage */
/**
 * Created with JetBrains WebStorm.
 * User: jf
 * Date: 3/21/13
 * Time: 4:01 PM
 * To change this template use File | Settings | File Templates.
 */


(function() {
    var _toolbar,
        _canvas,
        _html5,
        _margin_left,
        _margin_top,
        _opacity = 0.5,
        _position = "side",
        xOffset = 0,
        yOffset = 0;

    window.toolbar = {
       setup: function() {
           _toolbar = document.getElementById("toolbar");
           _canvas = document.getElementById("canvas-output");
           _html5 = document.getElementById("html5-output");

           var computedStyle = window.getComputedStyle(_html5);
           _margin_left = computedStyle.marginLeft;
           _margin_left = parseInt(_margin_left.substr(0, _margin_left.length - 2), 10);
           _margin_top = computedStyle.marginTop;
           _margin_top = parseInt(_margin_top.substr(0, _margin_top.length - 2), 10);

           _toolbar.addEventListener("change", toolbar.handleChange);
           document.addEventListener("keydown", toolbar.handleKeyDown);
       },

        handleChange: function(event) {
            var name = event.target.name,
                value = event.target.value;

            if (name === "opacity") {
                _opacity = value;
                if (_position === "overlay") {
                    _html5.style.opacity = _opacity;
                }
            } else if (name === "position") {
                _position = value;
                if (value === "side") {
                    _html5.style.left = (_canvas.width + _margin_left) + "px";
                    _html5.style.opacity = 1.0;

                    // reset offset
                    _html5.style.marginTop = _margin_top + "px";
                    _html5.style.marginLeft = _margin_left + "px";
                    document.getElementById("y-offset").innerText = "0px";
                    document.getElementById("x-offset").innerText = "0px";
                } else if (value === "overlay") {
                    _html5.style.left = 0;
                    _html5.style.opacity = _opacity;

                     // reset offset
                    _html5.style.marginTop = (_margin_top + yOffset) + "px";
                    _html5.style.marginLeft = (_margin_left + xOffset) + "px";
                    document.getElementById("y-offset").innerText = yOffset + "px";
                    document.getElementById("x-offset").innerText = xOffset + "px";
                }
            }
        },

        handleKeyDown: function(event) {
            if (_position === "overlay") {
                if (event.target.name === undefined) {
                    if (event.keyIdentifier === "Up" || event.keyIdentifier === "Down") {
                        if (event.keyIdentifier === "Up") {
                            yOffset --;
                        } else {
                            yOffset ++;
                        }
                        _html5.style.marginTop = (_margin_top + yOffset) + "px";
                        document.getElementById("y-offset").innerText = yOffset + "px";
                    } else if (event.keyIdentifier === "Left" || event.keyIdentifier === "Right") {
                        if (event.keyIdentifier === "Left") {
                            xOffset --;
                        } else {
                            xOffset ++;
                        }
                        _html5.style.marginLeft = (_margin_left + xOffset) + "px";
                        document.getElementById("x-offset").innerText = xOffset + "px";
                    }
                }
            }

            if (event.keyIdentifier === "PageUp" || event.keyIdentifier === "PageDown") {
                if (!pdfPage) {
                    // we are loading a page, let's wait...
                    return;
                }

                var pageIndex = pdfPage.pageInfo.pageIndex + 1;
                if (event.keyIdentifier === "PageUp") {
                    pageIndex --;
                    if (pageIndex < 1) {
                        return;
                    }
                } else {
                    pageIndex ++;
                    if (pageIndex > pdf.pdfInfo.numPages) {
                        return;
                    }
                }

                console.log("LOAD PAGE", pageIndex);
                loadPDFPage(pdf, pageIndex);
            }
        }
    }

})();

window.addEventListener('DOMContentLoaded', toolbar.setup, false);

