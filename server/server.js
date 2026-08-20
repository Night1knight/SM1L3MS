import express from "express";
import http from "http";
import crypto from "crypto";
import { WebSocketServer } from "ws";


const app = express();

const server =
    http.createServer(app);

const wss =
    new WebSocketServer({
        server
    });


const PORT =
    process.env.PORT || 3000;


const rooms =
    new Map();


const ROOM_TTL =
    30 * 60 * 1000;

const MAX_ROOM_SIZE =
    2;

const MAX_CIPHERTEXT_LENGTH =
    100000;

const MAX_IV_LENGTH =
    1000;

const MAX_PUBLIC_KEY_LENGTH =
    5000;


/*
==========================================
STATIC FILES
==========================================
*/

app.use(
    express.static("public")
);


/*
==========================================
ROOM ID
==========================================
*/

function generateRoomId() {

    return crypto
        .randomBytes(12)
        .toString("base64url");

}


/*
==========================================
SEND
==========================================
*/

function send(
    socket,
    data
) {

    if (
        socket &&
        socket.readyState === 1
    ) {

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

    if (!room) {
        return;
    }


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
SEND EXISTING PEER KEYS
==========================================
*/

function sendExistingPeerKeys(
    room,
    targetSocket
) {

    if (!room || !targetSocket) {
        return;
    }


    for (
        const [
            peerSocket,
            publicKey
        ]
        of room.publicKeys
    ) {

        if (
            peerSocket !== targetSocket
        ) {

            send(
                targetSocket,
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


/*
==========================================
WEBSOCKET
==========================================
*/

wss.on(
    "connection",
    (socket) => {

        socket.roomId = null;


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

                catch (error) {

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

                    /*
                    Kullanıcı zaten başka
                    bir odadaysa eski odadan çıkar.
                    */

                    if (
                        socket.roomId
                    ) {

                        const oldRoom =
                            rooms.get(
                                socket.roomId
                            );


                        if (oldRoom) {

                            oldRoom.sockets.delete(
                                socket
                            );

                            oldRoom.publicKeys.delete(
                                socket
                            );

                        }

                    }


                    const id =
                        generateRoomId();


                    const room = {

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

                    };


                    rooms.set(
                        id,
                        room
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


                    if (!requestedRoom) {

                        send(
                            socket,
                            {

                                type:
                                    "error",

                                message:
                                    "Geçersiz sohbet kodu."

                            }
                        );

                        return;

                    }


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


                    /*
                    Oda zaten dolu mu?
                    */

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


                    /*
                    Eski odadan çıkar.
                    */

                    if (
                        socket.roomId
                    ) {

                        const oldRoom =
                            rooms.get(
                                socket.roomId
                            );


                        if (oldRoom) {

                            oldRoom.sockets.delete(
                                socket
                            );

                            oldRoom.publicKeys.delete(
                                socket
                            );

                        }

                    }


                    /*
                    Yeni odaya ekle.
                    */

                    room.sockets.add(
                        socket
                    );


                    socket.roomId =
                        requestedRoom;


                    room.lastActivity =
                        Date.now();


                    send(
                        socket,
                        {

                            type:
                                "joined",

                            roomId:
                                requestedRoom

                        }
                    );


                    /*
                    Diğer kullanıcıya
                    peer geldiğini bildir.
                    */

                    broadcast(
                        room,
                        {

                            type:
                                "peer_connected"

                        },
                        socket
                    );


                    /*
                    Odadaki mevcut public key'i
                    yeni kullanıcıya gönder.

                    Bu özellikle önemli:
                    ilk kullanıcının public key'i
                    zaten varsa ikinci kullanıcı
                    bunu alır.
                    */

                    sendExistingPeerKeys(
                        room,
                        socket
                    );


                    return;

                }


                /*
                ==========================================
                ROOM CHECK
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
                PUBLIC KEY
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

                        send(
                            socket,
                            {

                                type:
                                    "error",

                                message:
                                    "Geçersiz public key."

                            }
                        );

                        return;

                    }


                    if (
                        packet.publicKey.length >
                        MAX_PUBLIC_KEY_LENGTH
                    ) {

                        send(
                            socket,
                            {

                                type:
                                    "error",

                                message:
                                    "Public key çok uzun."

                            }
                        );

                        return;

                    }


                    /*
                    Public key sadece RAM'de tutulur.
                    */

                    room.publicKeys.set(
                        socket,
                        packet.publicKey
                    );


                    /*
                    Public key'i diğer kullanıcıya gönder.
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

                        send(
                            socket,
                            {

                                type:
                                    "error",

                                message:
                                    "Geçersiz şifreli mesaj."

                            }
                        );

                        return;

                    }


                    if (
                        packet.ciphertext.length >
                        MAX_CIPHERTEXT_LENGTH
                    ) {

                        send(
                            socket,
                            {

                                type:
                                    "error",

                                message:
                                    "Mesaj çok uzun."

                            }
                        );

                        return;

                    }


                    if (
                        packet.iv.length >
                        MAX_IV_LENGTH
                    ) {

                        send(
                            socket,
                            {

                                type:
                                    "error",

                                message:
                                    "Geçersiz IV."

                            }
                        );

                        return;

                    }


                    /*
                    ==========================================
                    SUNUCU PLAINTEXT GÖRMEZ
                    ==========================================
                    */

                    const timestamp =
                        Date.now();


                    room.lastCiphertext = {

                        ciphertext:
                            packet.ciphertext,

                        iv:
                            packet.iv,

                        timestamp:
                            timestamp

                    };


                    /*
                    Sadece diğer kullanıcıya gönder.
                    */

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
                                timestamp

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

                    return;

                }

            }
        );


        /*
        ==========================================
        CLOSE
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


                /*
                Kullanıcıyı odadan çıkar.
                */

                room.sockets.delete(
                    socket
                );


                /*
                Public key'i sil.
                */

                room.publicKeys.delete(
                    socket
                );


                room.lastActivity =
                    Date.now();


                /*
                Diğer kullanıcıya bildir.
                */

                broadcast(
                    room,
                    {

                        type:
                            "peer_disconnected"

                    }
                );


                /*
                Oda boş kaldıysa
                hemen sil.
                */

                if (
                    room.sockets.size === 0
                ) {

                    rooms.delete(
                        socket.roomId
                    );

                }

            }
        );

    }
);


/*
==========================================
ROOM CLEANUP
==========================================
*/

setInterval(
    () => {

        const now =
            Date.now();


        for (
            const [
                id,
                room
            ]
            of rooms
        ) {

            if (
                now -
                room.lastActivity >
                ROOM_TTL
            ) {

                /*
                Oda süresi doldu.
                */

                for (
                    const socket
                    of room.sockets
                ) {

                    send(
                        socket,
                        {

                            type:
                                "error",

                            message:
                                "Sohbet süresi doldu."

                        }
                    );

                    try {

                        socket.close();

                    }

                    catch {

                        // ignore

                    }

                }


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
