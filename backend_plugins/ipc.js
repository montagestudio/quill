var Q = require("Q");

var g_registeredProcess = {},
    g_processID = (Date.now() * 1000) % 1000000000;

/*
    register

    register a client with the specified id and messageHandler
    if key 0, null or undefined, a new unique id will be use as key

    return the id
*/
exports.register = function(name, id, messageHandler, isSingleton) {
    if (name && isSingleton === true) {
        var processes = this.namedProcesses(name);
        if (processes && processes.length) {
            id = processes[0];
        }
    }

    if (typeof id !== "number" || id === 0) {
        id = ++ g_processID;
    }

    g_registeredProcess[id] = {name:name, id:id, handler:messageHandler};
    console.log("Process registered with name", name, "id", id);

    return id;
};


exports.unregister = function(id) {
    if (g_registeredProcess.hasOwnProperty(id)) {
        delete g_registeredProcess.hasOwnProperty(id);
    }
    return true;
};

exports.namedProcesses = function(name) {
    var result = [];

    for (var id in g_registeredProcess) {
        if (g_registeredProcess.hasOwnProperty(id)) {
            if (g_registeredProcess[id].name === name) {
                result.push(g_registeredProcess[id].id);    // we need to provide a number and not an array key
            }
        }
    }

    return result.length ? result : null;
};

exports.send = function(from, to, data) {
    var deferred = Q.defer();

    // only accept message from a registered process or null
    if (from == "anonymous" || g_registeredProcess[from]) {
        var dest = g_registeredProcess[to];
        if (dest && dest.handler) {
            var timeout = setTimeout(function() {
                deferred.reject(new Error("timeout!"));
                // JFD TODO: we should unregister the recipient
            }, 30000);

            dest.handler.fcall(from, to, data).then(function(result) {
                clearTimeout(timeout);
                deferred.resolve(result);
            }, function(e){
                clearTimeout(timeout);
                deferred.reject(e);
            });
        } else {
            deferred.reject(new Error("invalid or unknown recipient"));
        }
    } else {
        deferred.reject(new Error("invalid sender"));
    }

    return deferred.promise;
};


