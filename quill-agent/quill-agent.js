/**
 * The QuillAgent is injected into documents served by quill to have an object
 * inside the iframe that will respond to messages posted through the
 * iframe managed by the PageView component
 */


var QuillAgent = function () {

};

QuillAgent.prototype = {

    htmlController: null,

    remotePort: null,

    handleEvent: function (evt) {
        if ("load" === evt.type) {
            this.htmlController = new HtmlController(evt.target);

            window.addEventListener("message", this, false);
        } else if ("message" === evt.type || "http://client" === evt.origin) {
            if ("openChannel" === evt.data && evt.ports && evt.ports.length > 0) {
                this.remotePort = evt.ports[0];
                this.remotePort.onmessage = this.handleChannelMessage.bind(this);
            }
        }
    },

    handleChannelMessage: function (evt) {
        console.log("agent: onmessage", evt.data);

        var method,
            result;

        if ((method = evt.data.method) && typeof this.htmlController[method] === "function") {
            result = this.htmlController[method].apply(this.htmlController, evt.data.args);
            this.remotePort.postMessage({"method": method, "result": result});
        }
    }
};

var agent = new QuillAgent();
window.addEventListener("load", agent, false);
