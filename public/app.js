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


/*
==========================================
ECDH + AES-GCM
==========================================
*/

let ecdhKeyPair = null;

let sharedEncryptionKey = null;

let peerPublicKey = null;

let keyExchangeStarted = false;


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


    socket.onopen = async () => {

        setPresence(
            "Bağlı"
        );


        try {

            await ensureECDHKeyPair();

            await sendPublicKey();

        }

        catch (error) {

            console.error(
                "ECDH başlatma hatası:",
                error
            );

            setPresence(
                "Şifreleme başlatılamadı"
            );

        }

    };


    socket.onclose = () => {

        setPresence(
            "Bağlantı kesildi"
        );

        sharedEncryptionKey = null;

        peerPublicKey = null;

        keyExchangeStarted = false;

    };


    socket.onerror = (error) => {

        console.error(
            "WebSocket hatası:",
            error
        );

        setPresence(
            "Bağlantı hatası"
        );

    };


    socket.onmessage =
        async (event) => {

            let packet;


            try {

                packet =
                    JSON.parse(
                        event.data
                    );

            }

            catch (error) {

                console.error(
                    "Geçersiz WebSocket paketi:",
                    error
                );

                return;

            }


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


                /*
                Yeni peer bağlandığında
                public key'i tekrar gönder.
                */

                try {

                    keyExchangeStarted =
                        false;

                    await sendPublicKey();

                }

                catch (error) {

                    console.error(
                        "Public key gönderilemedi:",
                        error
                    );

                }

                return;
            }


            /*
            ==============================
            PEER PUBLIC KEY
            ==============================
            */

            if (
                packet.type ===
                "peer_key"
            ) {

                try {

                    await importPeerPublicKey(
                        packet.publicKey
                    );

                    setPresence(
                        "Şifreli bağlantı hazır"
                    );

                }

                catch (error) {

                    console.error(
                        "ECDH anahtar değişimi başarısız:",
                        error
                    );

                    sharedEncryptionKey =
                        null;

                    setPresence(
                        "Şifreleme anahtarı oluşturulamadı"
                    );

                }

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

                sharedEncryptionKey =
                    null;

                peerPublicKey =
                    null;

                keyExchangeStarted =
                    false;

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

                catch (error) {

                    console.error(
                        "Decrypt error:",
                        error
                    );


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
ECDH KEY PAIR
==========================================
*/

async function ensureECDHKeyPair() {

    if (
        ecdhKeyPair
    ) {

        return;

    }


    ecdhKeyPair =
        await crypto.subtle.generateKey(

            {
                name:
                    "ECDH",

                namedCurve:
                    "P-256"
            },

            true,

            [
                "deriveKey"
            ]

        );

}


/*
==========================================
EXPORT PUBLIC KEY
==========================================
*/

async function exportPublicKey() {

    await ensureECDHKeyPair();


    const publicKey =
        await crypto.subtle.exportKey(
            "jwk",
            ecdhKeyPair.publicKey
        );


    return JSON.stringify(
        publicKey
    );

}


/*
==========================================
SEND PUBLIC KEY
==========================================
*/

async function sendPublicKey() {

    if (
        !socket ||
        socket.readyState !==
        WebSocket.OPEN
    ) {

        return;

    }


    if (
        keyExchangeStarted
    ) {

        return;

    }


    keyExchangeStarted =
        true;


    const publicKey =
        await exportPublicKey();


    socket.send(
        JSON.stringify({

            type:
                "public_key",

            publicKey:
                publicKey

        })
    );

}


/*
==========================================
IMPORT PEER PUBLIC KEY
==========================================
*/

async function importPeerPublicKey(
    publicKeyString
) {

    await ensureECDHKeyPair();


    if (
        typeof publicKeyString !==
        "string"
    ) {

        throw new Error(
            "Geçersiz public key."
        );

    }


    const jwk =
        JSON.parse(
            publicKeyString
        );


    const importedPublicKey =
        await crypto.subtle.importKey(

            "jwk",

            jwk,

            {
                name:
                    "ECDH",

                namedCurve:
                    "P-256"
            },

            false,

            []

        );


    peerPublicKey =
        importedPublicKey;


    /*
    ==========================================
    DERIVE SHARED AES-256-GCM KEY
    ==========================================
    */

    sharedEncryptionKey =
        await crypto.subtle.deriveKey(

            {
                name:
                    "ECDH",

                public:
                    importedPublicKey

            },

            ecdhKeyPair.privateKey,

            {
                name:
                    "AES-GCM",

                length:
                    256
            },

            false,

            [
                "encrypt",
                "decrypt"
            ]

        );

}


/*
==========================================
WAIT FOR ENCRYPTION KEY
==========================================
*/

async function waitForEncryptionKey(
    timeout = 10000
) {

    const start =
        Date.now();


    while (
        !sharedEncryptionKey
    ) {

        if (
            Date.now() -
            start >
            timeout
        ) {

            throw new Error(
                "ECDH anahtar değişimi tamamlanamadı."
            );

        }


        await new Promise(
            (resolve) => {

                setTimeout(
                    resolve,
                    50
                );

            }
        );

    }

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


    let binary =
        "";


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
        atob(
            base64
        );


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

    await waitForEncryptionKey();


    const encoder =
        new TextEncoder();


    const data =
        encoder.encode(
            text
        );


    /*
    AES-GCM için her mesajda
    yeni random IV.
    */

    const iv =
        crypto.getRandomValues(
            new Uint8Array(12)
        );


    const encrypted =
        await crypto.subtle.encrypt(

            {
                name:
                    "AES-GCM",

                iv:
                    iv

            },

            sharedEncryptionKey,

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

    await waitForEncryptionKey();


    const ivBuffer =
        base64ToBuffer(
            iv
        );


    const encryptedBuffer =
        base64ToBuffer(
            ciphertext
        );


    const decrypted =
        await crypto.subtle.decrypt(

            {
                name:
                    "AES-GCM",

                iv:
                    ivBuffer

            },

            sharedEncryptionKey,

            encryptedBuffer

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
                hour:
                    "2-digit",

                minute:
                    "2-digit"
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

            }

            else {

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

            if (
                !socket ||
                socket.readyState !==
                WebSocket.OPEN
            ) {

                alert(
                    "Sunucu bağlantısı yok."
                );

                return;

            }


            await ensureECDHKeyPair();


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


            if (
                !socket ||
                socket.readyState !==
                WebSocket.OPEN
            ) {

                alert(
                    "Sunucu bağlantısı yok."
                );

                return;

            }


            await ensureECDHKeyPair();


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


            try {

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

            catch (error) {

                console.error(
                    "Kopyalama hatası:",
                    error
                );

            }

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
                !socket ||
                socket.readyState !==
                WebSocket.OPEN
            ) {

                alert(
                    "Sunucu bağlantısı yok."
                );

                return;

            }


            /*
            ==========================================
            WAIT FOR ECDH
            ==========================================
            */

            try {

                await waitForEncryptionKey();

            }

            catch (error) {

                console.error(
                    "Encryption key hazır değil:",
                    error
                );

                alert(
                    "Diğer kullanıcıyla güvenli bağlantı henüz kurulmadı."
                );

                return;

            }


            /*
            ==========================================
            ENCRYPT
            ==========================================
            */

            let encrypted;


            try {

                encrypted =
                    await encryptMessage(
                        text
                    );

            }

            catch (error) {

                console.error(
                    "Encryption error:",
                    error
                );

                alert(
                    "Mesaj şifrelenemedi."
                );

                return;

            }


            /*
            ==========================================
            SEND CIPHERTEXT
            ==========================================
            */

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
            socket &&
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
