var net = require('net');
var rid = require('./utils/rid');
var debug = require('debug')('WoChat-Server:socket');
// var Client = require('./models/client');
var socketEvent = require('./utils/socketEvent');
var jwt = require('jsonwebtoken');
var config = require('./utils/config');
var SocketBuffer = require('./utils/socketBuffer');
var Message = require('./models/message');

// var server, socketPort;
// var clients = {};
// var guestClients = {};

var connections = {};

module.exports = {
    createServer: createServer/*,*/
    // getClient: getClient,
    // getGuestClient: getGuestClient
};

function createServer(port) {
    socketPort = port;
    server = net.createServer();
    server.listen(socketPort);
    server.on('listening', onListening);
    server.on('error', onError);
    server.on('connection', onConnection)
}

// function getClient(cid) {
//     return clients[cid];
// }

// function getGuestClient(gcid) {
//     return guestClients[gcid];
// }

function onListening() {
    var addr = server.address();
    var bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'socketPort ' + addr.port;
    debug('Listening on ' + bind);
}

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof socketPort === 'string'
        ? 'Pipe ' + socketPort
        : 'Port ' + socketPort;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

// function onConnection(sock) {
//     var id = rid.get(24);
//     // Process sock object
//     sock['clientId'] = null;
//     sock['guestClientId'] = id;
//     sock.on('data', socketDataRouter);
//     sock.on('close', socketCloseHandler);
//     // TODO
//     guestClients[id] = new Client(sock, getIdSender(id));
// }

function onConnection(connection) {
    connection.setEncoding('utf8');
    connection.setTimeout(2 * 60 * 1000); // 2 min
    connection.setNoDelay(true);

    socketWriter(connection, {
        type: 'info',
        data: 'Hello\n'
    });

    connection.on('end', function () {
        if (connection.hasOwnProperty('clientId')) {
            var clientId = connection.clientId;
            delete connections[clientId];
            socketEvent.Client.remove(clientId);
        }
        debug('socket of client ' + connection.clientId + ' closed');
    });

    var socketBuffer = new SocketBuffer();
    socketBuffer.on('packet', onData);

    connection.on('data', function (data) {
        socketBuffer.addBuffer(data);
    });

    connection.on('timeout', function () {
        connection.end();
    });

    connection.on('error', function () {
        debug('error: ', error);
        connection.end();
    });

    function onData (packet) {
        debug(packet);
        switch (packet.type) {
            case 'token':
                onSignIn(packet.data);
                break;
        }
    }

    function onSignIn(token) {

        isUnSignedIn()
        .then(verifyToken)
        .then(signIn)
        .then(checkUnsendMsg)
        .catch(sendError);

        function isUnSignedIn() {
            debug('isUnSignedIn');
            return connection.hasOwnProperty('clientId') ? Promise.reject('Already Signed In') : Promise.resolve();
        }

        function verifyToken() {
            debug('verifyToken(' + token + ')');
            return new Promise(function (resolve, reject) {
                jwt.verify(token, config.secret, function (err, decoded) {
                    err ? reject('Invalid Token') : resolve(decoded.user_id);
                });
            });
        }

        function signIn(clientId) {
            debug('signIn(' + clientId + ')');
            connections[clientId] = connection;
            connection.clientId = clientId;
            var client = new socketEvent.Client(clientId);
            client.on('message', function (msg) {
                socketWriter(connection, {
                    type: 'message',
                    data: msg
                });
            });
            socketWriter(connection, {
                type: 'info',
                data: 'Sign In Success\n'
            });
            return Promise.resolve(clientId);
        }

        function checkUnsendMsg(clientId) {
            debug('checkUnsendMsg(' + clientId + ')');
            return Message.find({
                receiver_id: clientId
            }).exec()
            .then(function (msgs) {
                debug('unsend: ' + msgs);
                if (!msgs.empty) {
                    socketWriter(connection, {
                        type: 'message',
                        data: msgs
                    });
                }
                return Promise.resolve();
            });
        }

        function sendError(error) {
            debug('sendError(' + error + ')');
            socketWriter(connection, {
                type: 'info',
                data: error
            });
        }
    }

}

// function socketDataRouter(data) {
    // Stub
// }

// function socketCloseHandler() {
    // Stub
// }

// function removeGuestClient(gcid) {
//     if (gcid) {
//         var client = guestClients[gcid];
//         if (client) {
//             var sock = client['sock'];
//             if (sock && (sock.writable || sock.readable)) {
//                 sock.destroy();
//             }
//             guestClients[gcid] = null;
//         }
//     }
// }

// function getIdSender(id) {
//     var json = JSON.stringify({
//         type: 'socket_id',
//         data: {
//             socket_id: id
//         }
//     });
//     var times = 0;
//     var sender = setInterval(function () {
//         ++times;
//         if (times > 10) {
//             clearInterval(sender);
//             removeGuestClient(id);
//             return;
//         }
//         writeToGuestClient(id, json);
//     }, 3 * 1000);
//     return sender;
// }

// function writeToClient(cid, data) {
//     if (cid && clients[cid]) {
//         socketWriter(clients[cid]['sock'], data);
//     }
// }

// function writeToGuestClient(gcid, data) {
//     if (gcid && guestClients[gcid]) {
//         socketWriter(guestClients[gcid]['sock'], data);
//     }
// }

/**
 * Write data to a socket
 * @param s Socket object
 * @param d Buffer object to be written
 */

function socketWriter(s, d) {
    if (s && d) {
        if (typeof d === 'object') {
            s.write(JSON.stringify(d));
        } else {
            s.write(d);
        }
    }
}
