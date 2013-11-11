/**
 * @module ./position-inspector.reel
 * @requires montage/ui/component
 */
var Component = require("montage/ui/component").Component;

/**
 * @class PositionInspector
 * @extends Component
 */
exports.PositionInspector = Component.specialize(/** @lends PositionInspector# */ {
    constructor: {
        value: function PositionInspector() {
            this.super();
        }
    }
});
