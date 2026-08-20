import express from "express";
import http from "http";
import crypto from "crypto";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const ROOM_TTL = 30 * 60 * 1000;
const MAX_ROOM_SIZE = 2;
const MAX_CIPHERTEXT_LENGTH = 100000;
const MAX_IV_LENGTH = 1000;
const MAX_PUBLIC_KEY_LENGTH = 5000;


/*
==========================================
STATIC FILES
==========================================
*/

app.use(express.static("public"));


/*
==========================================
ROOM ID
==========================================
*/

function generateRoomId() {
    return crypto.randomBytes(12).toString("base64url");
}


/*
==========================================
SEND
==========================================
*/

function send(socket, data) {

    if (socket.readyState === 1) {

        socket.send(
            JSON.stringify(data)
        );

    }

}


/*
==========================================
BROADCAST
==========================================
*/

function broadcast(
    room,
    data,
    except = null
) {

    for (
        const socket of room.sockets
    ) {

        if (
            socket !== except
        ) {

            send(
                socket,
                data
            );

        }

    }

}


/*
==========================================
PUBLIC KEY RELAY
==========================================
*/

function broadcastPeerKeys(room) {

    for (
        const socket of room.sockets
    ) {

        for (
            const [peerSocket, publicKey]
            of room.publicKeys
        ) {

            if (
                peerSocket !== socket
            ) {

                send(
                    socket,
                    {
                        type:
                            "peer_key",

                        publicKey:
                            publicKey
                    }
                );

            }

        }

    }

}


/*
==========================================
WEBSOCKET CONNECTION
==========================================
*/

wss.on(
    "connection",
    (socket) => {


        /*
        ==========================================
        MESSAGE
        ==========================================
        */

        socket.on(
            "message",
            (raw) => {

                let packet;


                /*
                ==========================================
                PARSE
                ==========================================
                */

                try {

                    packet =
                        JSON.parse(
                            raw.toString()
                        );

                }

                catch {

                    send(
                        socket,
                        {
                            type:
                                "error",

                            message:
                                "Geçersiz veri."
                        }
                    );

                    return;

                }


                /*
                ==========================================
                ROOM CREATE
                ==========================================
                */

                if (
                    packet.type ===
                    "room_create"
                ) {

                    const id =
                        generateRoomId();


                    rooms.set(
                        id,
                        {

                            sockets:
                                new Set([
                                    socket
                                ]),

                            lastActivity:
                                Date.now(),

                            lastCiphertext:
                                null,

                            publicKeys:
                                new Map()

                        }
                    );


                    socket.roomId =
                        id;


                    send(
                        socket,
                        {

                            type:
                                "room_created",

                            roomId:
                                id

                        }
                    );


                    return;

                }


                /*
                ==========================================
                ROOM JOIN
                ==========================================
                */

                if (
                    packet.type ===
                    "room_join"
                ) {

                    const requestedRoom =
                        typeof packet.roomId ===
                        "string"
                            ? packet.roomId.trim()
                            : "";


                    const room =
                        rooms.get(
                            requestedRoom
                        );


                    if (!room) {

                        send(
                            socket,
                            {

                                type:
                                    "error",

                                message:
                                    "Sohbet bulunamadı veya süresi doldu."

                            }
                        );

                        return;

                    }


                    if (
                        room.sockets.size >=
                        MAX_ROOM_SIZE
                    ) {

                        send(
                            socket,
                            {

                                type:
                                    "error",

                                message:
                                    "Bu sohbet zaten dolu."

                            }
                        );

                        return;

                    }


                    room.sockets.add(
                        socket
                    );


                    room.lastActivity =
                        Date.now();


                    socket.roomId =
                        requestedRoom;


                    send(
                        socket,
                        {

                            type:
                                "joined",

                            roomId:
                                requestedRoom

                        }
                    );


                    broadcast(
                        room,
                        {

                            type:
                                "peer_connected"

                        },
                        socket
                    );


                    /*
                    ------------------------------------------
                    IMPORTANT:
                    Send already-known public keys.
                    ------------------------------------------
                    */

                    broadcastPeerKeys(
                        room
                    );


                    return;

                }


                /*
                ==========================================
                FIND ROOM
                ==========================================
                */

                const room =
                    rooms.get(
                        socket.roomId
                    );


                if (!room) {

                    send(
                        socket,
                        {

                            type:
                                "error",

                            message:
                                "Aktif sohbet bulunamadı."

                        }
                    );

                    return;

                }


                room.lastActivity =
                    Date.now();


                /*
                ==========================================
                ECDH PUBLIC KEY
                ==========================================
                */

                if (
                    packet.type ===
                    "public_key"
                ) {

                    if (
                        typeof packet.publicKey !==
                        "string"
                    ) {

                        return;

                    }


                    if (
                        packet.publicKey.length >
                        MAX_PUBLIC_KEY_LENGTH
                    ) {

                        return;

                    }


                    /*
                    ------------------------------------------
                    Store public key only in RAM.
                    ------------------------------------------
                    */

                    room.publicKeys.set(
                        socket,
                        packet.publicKey
                    );


                    /*
                    ------------------------------------------
                    Send this public key to the other peer.
                    ------------------------------------------
                    */

                    broadcast(
                        room,
                        {

                            type:
                                "peer_key",

                            publicKey:
                                packet.publicKey

                        },
                        socket
                    );


                    return;

                }


                /*
                ==========================================
                ENCRYPTED MESSAGE
                ==========================================
                */

                if (
                    packet.type ===
                    "encrypted_message"
                ) {

                    if (
                        typeof packet.ciphertext !==
                        "string" ||

                        typeof packet.iv !==
                        "string"
                    ) {

                        return;

                    }


                    if (
                        packet.ciphertext.length >
                        MAX_CIPHERTEXT_LENGTH
                    ) {

                        return;

                    }


                    if (
                        packet.iv.length >
                        MAX_IV_LENGTH
                    ) {

                        return;

                    }


                    /*
                    ------------------------------------------
                    Server stores only ciphertext.
                    ------------------------------------------
                    */

                    room.lastCiphertext = {

                        ciphertext:
                            packet.ciphertext,

                        iv:
                            packet.iv,

                        timestamp:
                            Date.now()

                    };


                    broadcast(
                        room,
                        {

                            type:
                                "encrypted_message",

                            ciphertext:
                                packet.ciphertext,

                            iv:
                                packet.iv,

                            timestamp:
                                Date.now()

                        },
                        socket
                    );


                    return;

                }


                /*
                ==========================================
                TYPING
                ==========================================
                */

                if (
                    packet.type ===
                    "typing"
                ) {

                    broadcast(
                        room,
                        {

                            type:
                                "typing",

                            value:
                                Boolean(
                                    packet.value
                                )

                        },
                        socket
                    );


                    return;

                }


                /*
                ==========================================
                PING
                ==========================================
                */

                if (
                    packet.type ===
                    "ping"
                ) {

                    send(
                        socket,
                        {

                            type:
                                "pong"

                        }
                    );

                }

            }
        );


        /*
        ==========================================
        DISCONNECT
        ==========================================
        */

        socket.on(
            "close",
            () => {

                const room =
                    rooms.get(
                        socket.roomId
                    );


                if (!room) {

                    return;

                }


                room.sockets.delete(
                    socket
                );


                /*
                ------------------------------------------
                Remove ECDH public key.
                ------------------------------------------
                */

                room.publicKeys.delete(
                    socket
                );


                room.lastActivity =
                    Date.now();


                broadcast(
                    room,
                    {

                        type:
                            "peer_disconnected"

                    }
                );

            }
        );

    }
);


/*
==========================================
AUTOMATIC ROOM CLEANUP
==========================================
*/

setInterval(
    () => {

        const now =
            Date.now();


        for (
            const [id, room]
            of rooms
        ) {

            if (
                now -
                room.lastActivity >
                ROOM_TTL
            ) {

                rooms.delete(
                    id
                );

            }

        }

    },
    60 * 1000
);


/*
==========================================
SERVER
==========================================
*/

server.listen(
    PORT,
    () => {

        console.log(
            `Secure Carrier running on port ${PORT}`
        );

    }
);
