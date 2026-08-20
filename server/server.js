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

app.use(express.static("public"));

function generateRoomId() {
    return crypto.randomBytes(12).toString("base64url");
}

function send(socket, data) {
    if (socket.readyState === 1) {
        socket.send(JSON.stringify(data));
    }
}

function broadcast(room, data, except = null) {
    for (const socket of room.sockets) {
        if (socket !== except) {
            send(socket, data);
        }
    }
}

wss.on("connection", (socket) => {

    socket.on("message", (raw) => {

        let packet;

        try {
            packet = JSON.parse(raw.toString());
        } catch {
            send(socket, {
                type: "error",
                message: "Geçersiz veri."
            });

            return;
        }

        /*
        ==========================================
        ROOM CREATE
        ==========================================
        */

        if (packet.type === "room_create") {

            const id = generateRoomId();

            rooms.set(id, {
                sockets: new Set([socket]),
                lastActivity: Date.now(),
                lastCiphertext: null
            });

            socket.roomId = id;

            send(socket, {
                type: "room_created",
                roomId: id
            });

            return;
        }

        /*
        ==========================================
        ROOM JOIN
        ==========================================
        */

        if (packet.type === "room_join") {

            const room = rooms.get(packet.roomId);

            if (!room) {

                send(socket, {
                    type: "error",
                    message: "Sohbet bulunamadı veya süresi doldu."
                });

                return;
            }

            if (room.sockets.size >= 2) {

                send(socket, {
                    type: "error",
                    message: "Bu sohbet zaten dolu."
                });

                return;
            }

            room.sockets.add(socket);

            room.lastActivity = Date.now();

            socket.roomId = packet.roomId;

            send(socket, {
                type: "joined",
                roomId: packet.roomId
            });

            broadcast(
                room,
                {
                    type: "peer_connected"
                },
                socket
            );

            return;
        }

        const room = rooms.get(socket.roomId);

        if (!room) {

            send(socket, {
                type: "error",
                message: "Aktif sohbet bulunamadı."
            });

            return;
        }

        room.lastActivity = Date.now();

        /*
        ==========================================
        ENCRYPTED MESSAGE
        ==========================================
        */

        if (packet.type === "encrypted_message") {

            if (
                typeof packet.ciphertext !== "string" ||
                typeof packet.iv !== "string"
            ) {
                return;
            }

            /*
             * ÖNEMLİ:
             *
             * Burada plaintext mesaj yok.
             *
             * Sunucu sadece:
             *
             * ciphertext
             * iv
             *
             * görüyor.
             */

            room.lastCiphertext = {
                ciphertext: packet.ciphertext,
                iv: packet.iv,
                timestamp: Date.now()
            };

            broadcast(
                room,
                {
                    type: "encrypted_message",
                    ciphertext: packet.ciphertext,
                    iv: packet.iv,
                    timestamp: Date.now()
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

        if (packet.type === "typing") {

            broadcast(
                room,
                {
                    type: "typing",
                    value: Boolean(packet.value)
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

        if (packet.type === "ping") {

            send(socket, {
                type: "pong"
            });

        }

    });

    /*
    ==========================================
    DISCONNECT
    ==========================================
    */

    socket.on("close", () => {

        const room = rooms.get(socket.roomId);

        if (!room) {
            return;
        }

        room.sockets.delete(socket);

        room.lastActivity = Date.now();

        broadcast(room, {
            type: "peer_disconnected"
        });

    });

});


/*
==========================================
AUTOMATIC ROOM CLEANUP
==========================================
*/

setInterval(() => {

    const now = Date.now();

    for (const [id, room] of rooms) {

        if (
            now - room.lastActivity >
            ROOM_TTL
        ) {

            rooms.delete(id);

        }

    }

}, 60 * 1000);


/*
==========================================
SERVER
==========================================
*/

server.listen(PORT, () => {

    console.log(
        `Secure Carrier running on http://localhost:${PORT}`
    );

});