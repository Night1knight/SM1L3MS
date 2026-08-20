const $ = (id) =>
    document.getElementById(id);


const messages =
    $("messages");

const input =
    $("input");

const presence =
    $("presence");

const typing =
    $("typing");


let socket = null;

let roomId = null;

let encryptionKey = null;


/*
==========================================
WEBSOCKET
==========================================
*/

function connect() {

    const protocol =
        location.protocol === "https:"
            ? "wss:"
            : "ws:";


    socket =
        new WebSocket(
            `${protocol}//${location.host}`
        );


    socket.onopen = () => {

        setPresence(
            "Bağlı"
        );

    };


    socket.onclose = () => {

        setPresence(
            "Bağlantı kesildi"
        );

    };


    socket.onerror = () => {

        setPresence(
            "Bağlantı hatası"
        );

    };


    socket.onmessage =
        async (event) => {

            const packet =
                JSON.parse(
                    event.data
                );


            /*
            ==============================
            ROOM CREATED
            ==============================
            */

            if (
                packet.type ===
                "room_created"
            ) {

                roomId =
                    packet.roomId;

                $("roomCode")
                    .textContent =
                    roomId;

                setPresence(
                    "Sohbet hazır"
                );

                closeSidebar();

                return;
            }


            /*
            ==============================
            JOINED
            ==============================
            */

            if (
                packet.type ===
                "joined"
            ) {

                roomId =
                    packet.roomId;

                $("roomCode")
                    .textContent =
                    roomId;

                setPresence(
                    "Sohbet hazır"
                );

                closeSidebar();

                return;
            }


            /*
            ==============================
            PEER CONNECTED
            ==============================
            */

            if (
                packet.type ===
                "peer_connected"
            ) {

                setPresence(
                    "Çevrimiçi"
                );

                return;
            }


            /*
            ==============================
            PEER DISCONNECTED
            ==============================
            */

            if (
                packet.type ===
                "peer_disconnected"
            ) {

                setPresence(
                    "Bağlantı bekleniyor"
                );

                return;
            }


            /*
            ==============================
            TYPING
            ==============================
            */

            if (
                packet.type ===
                "typing"
            ) {

                typing
                    .classList
                    .toggle(
                        "hidden",
                        !packet.value
                    );

                return;
            }


            /*
            ==============================
            ENCRYPTED MESSAGE
            ==============================
            */

            if (
                packet.type ===
                "encrypted_message"
            ) {

                try {

                    const plaintext =
                        await decryptMessage(
                            packet.ciphertext,
                            packet.iv
                        );


                    addBubble(
                        plaintext,
                        false,
                        packet.timestamp
                    );

                }

                catch {

                    addBubble(
                        "Mesaj şifresi çözülemedi.",
                        false,
                        Date.now(),
                        true
                    );

                }

                return;
            }


            /*
            ==============================
            ERROR
            ==============================
            */

            if (
                packet.type ===
                "error"
            ) {

                alert(
                    packet.message
                );

            }

        };

}


/*
==========================================
AES KEY
==========================================
*/

async function ensureEncryptionKey() {

    if (encryptionKey) {
        return;
    }


    encryptionKey =
        await crypto.subtle.generateKey(

            {
                name: "AES-GCM",

                length: 256
            },

            true,

            [
                "encrypt",
                "decrypt"
            ]

        );

}


/*
==========================================
BASE64
==========================================
*/

function bufferToBase64(
    buffer
) {

    const bytes =
        new Uint8Array(
            buffer
        );


    let binary = "";


    for (
        const byte of bytes
    ) {

        binary +=
            String.fromCharCode(
                byte
            );

    }


    return btoa(
        binary
    );

}


function base64ToBuffer(
    base64
) {

    const binary =
        atob(base64);


    const bytes =
        new Uint8Array(
            binary.length
        );


    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(i);

    }


    return bytes;

}


/*
==========================================
ENCRYPT
==========================================
*/

async function encryptMessage(
    text
) {

    await ensureEncryptionKey();


    const encoder =
        new TextEncoder();


    const data =
        encoder.encode(
            text
        );


    const iv =
        crypto.getRandomValues(
            new Uint8Array(12)
        );


    const encrypted =
        await crypto.subtle.encrypt(

            {
                name: "AES-GCM",

                iv: iv
            },

            encryptionKey,

            data

        );


    return {

        ciphertext:
            bufferToBase64(
                encrypted
            ),

        iv:
            bufferToBase64(
                iv
            )

    };

}


/*
==========================================
DECRYPT
==========================================
*/

async function decryptMessage(
    ciphertext,
    iv
) {

    await ensureEncryptionKey();


    const decrypted =
        await crypto.subtle.decrypt(

            {
                name: "AES-GCM",

                iv:
                    base64ToBuffer(
                        iv
                    )

            },

            encryptionKey,

            base64ToBuffer(
                ciphertext
            )

        );


    return new TextDecoder()
        .decode(
            decrypted
        );

}


/*
==========================================
ADD MESSAGE
==========================================
*/

function addBubble(
    text,
    mine,
    timestamp = Date.now(),
    error = false
) {

    const welcome =
        document.querySelector(
            ".welcome"
        );


    if (welcome) {
        welcome.remove();
    }


    const bubble =
        document.createElement(
            "div"
        );


    bubble.className =
        "bubble";


    if (mine) {

        bubble.classList.add(
            "mine"
        );

    }


    if (error) {

        bubble.style.opacity =
            "0.6";

    }


    const message =
        document.createElement(
            "span"
        );


    message.textContent =
        text;


    const time =
        document.createElement(
            "span"
        );


    time.className =
        "time";


    time.textContent =
        new Date(
            timestamp
        ).toLocaleTimeString(
            "tr-TR",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );


    bubble.append(
        message,
        time
    );


    messages.appendChild(
        bubble
    );


    messages.scrollTop =
        messages.scrollHeight;

}


/*
==========================================
STATUS
==========================================
*/

function setPresence(
    text
) {

    presence.textContent =
        text;

}


/*
==========================================
MOBILE SIDEBAR TOGGLE
==========================================
*/

const sidebar =
    document.querySelector(
        ".sidebar"
    );

const sidebarOverlay =
    $("sidebarOverlay");


function openSidebar() {

    sidebar.classList.add(
        "open"
    );

    sidebarOverlay.classList.add(
        "open"
    );

}


function closeSidebar() {

    sidebar.classList.remove(
        "open"
    );

    sidebarOverlay.classList.remove(
        "open"
    );

}


$("menuToggle")
    .addEventListener(
        "click",
        () => {

            if (
                sidebar.classList.contains(
                    "open"
                )
            ) {

                closeSidebar();

            } else {

                openSidebar();

            }

        }
    );


sidebarOverlay.addEventListener(
    "click",
    closeSidebar
);


/*
==========================================
CREATE ROOM
==========================================
*/

$("newRoom")
    .addEventListener(
        "click",
        async () => {

            await ensureEncryptionKey();


            if (
                socket.readyState !==
                WebSocket.OPEN
            ) {

                return;

            }


            socket.send(
                JSON.stringify({

                    type:
                        "room_create"

                })
            );

        }
    );


/*
==========================================
JOIN ROOM
==========================================
*/

$("joinRoom")
    .addEventListener(
        "click",
        async () => {

            const id =
                prompt(
                    "Sohbet kodunu girin:"
                );


            if (!id) {
                return;
            }


            await ensureEncryptionKey();


            roomId =
                id.trim();


            socket.send(
                JSON.stringify({

                    type:
                        "room_join",

                    roomId:
                        roomId

                })
            );

        }
    );


/*
==========================================
COPY ROOM
==========================================
*/

$("copyRoom")
    .addEventListener(
        "click",
        async () => {

            if (!roomId) {
                return;
            }


            await navigator.clipboard
                .writeText(
                    roomId
                );


            $("copyRoom")
                .textContent =
                "✓";


            setTimeout(
                () => {

                    $("copyRoom")
                        .textContent =
                        "⧉";

                },
                1000
            );

        }
    );


/*
==========================================
SEND MESSAGE
==========================================
*/

$("composer")
    .addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            const text =
                input.value.trim();


            if (!text) {
                return;
            }


            if (!roomId) {

                alert(
                    "Önce bir sohbet oluşturun veya sohbete katılın."
                );

                return;

            }


            if (
                socket.readyState !==
                WebSocket.OPEN
            ) {

                alert(
                    "Sunucu bağlantısı yok."
                );

                return;

            }


            const encrypted =
                await encryptMessage(
                    text
                );


            socket.send(
                JSON.stringify({

                    type:
                        "encrypted_message",

                    ciphertext:
                        encrypted.ciphertext,

                    iv:
                        encrypted.iv

                })
            );


            /*
            Kullanıcının kendi mesajını
            ekranda hemen gösteriyoruz.
            */

            addBubble(
                text,
                true
            );


            input.value = "";

            input.style.height =
                "auto";


            socket.send(
                JSON.stringify({

                    type:
                        "typing",

                    value:
                        false

                })
            );

        }
    );


/*
==========================================
TYPING
==========================================
*/

input.addEventListener(
    "input",
    () => {

        input.style.height =
            "auto";


        input.style.height =
            Math.min(
                input.scrollHeight,
                130
            ) + "px";


        if (
            socket.readyState ===
            WebSocket.OPEN
        ) {

            socket.send(
                JSON.stringify({

                    type:
                        "typing",

                    value:
                        input.value.length > 0

                })
            );

        }

    }
);


/*
==========================================
ENTER = SEND
SHIFT + ENTER = NEW LINE
==========================================
*/

input.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();


            $("composer")
                .requestSubmit();

        }

    }
);


/*
==========================================
START
==========================================
*/

connect();