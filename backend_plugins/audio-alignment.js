 AdaptConnection = require("filament/q-connection/adapt"),
 Q = require("filament/q");

    // _backend: {
    //     value: null
    // },

    // backend: {
    //     get: function() {
    //         var self = this;

    //         if (self._backend == null) {
    //             var connection = AdaptConnection(new WebSocket("ws://localhost:" + lumieres.nodePort));
    //             connection.closed.then(function() {
    //                 self._backend = null;
    //             });

    //             self._backend = Connection(connection);
    //         }

    //         return self._backend;
    //     }
    // },
