import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");


function readProjectFile(relativePath) {

    return fs.readFileSync(
        path.join(ROOT, relativePath),
        "utf8"
    );

}


/*
==========================================
1. PROJE DOSYALARI
==========================================
*/

test(
    "proje dosyaları mevcut",
    () => {

        const files = [

            "package.json",

            "server/server.js",

            "public/index.html",

            "public/app.js",

            "public/style.css"

        ];


        for (
            const file of files
        ) {

            assert.equal(
                fs.existsSync(
                    path.join(ROOT, file)
                ),
                true,
                `${file} bulunamadı`
            );

        }

    }
);


/*
==========================================
2. SERVER TEST
==========================================
*/

test(
    "server ciphertext relay kullanıyor",
    () => {

        const server =
            readProjectFile(
                "server/server.js"
            );


        assert.equal(
            server.includes(
                "packet.ciphertext"
            ),
            true
        );


        assert.equal(
            server.includes(
                "packet.iv"
            ),
            true
        );


        assert.equal(
            server.includes(
                "packet.message"
            ),
            false
        );

    }
);


/*
==========================================
3. ŞİFRELEME TESTİ
==========================================
*/

test(
    "AES-GCM kullanılıyor",
    () => {

        const app =
            readProjectFile(
                "public/app.js"
            );


        assert.equal(
            app.includes(
                "AES-GCM"
            ),
            true
        );


        assert.equal(
            app.includes(
                "crypto.subtle.encrypt"
            ),
            true
        );


        assert.equal(
            app.includes(
                "crypto.subtle.decrypt"
            ),
            true
        );

    }
);


/*
==========================================
4. UI TEST
==========================================
*/

test(
    "mesajlaşma arayüzü mevcut",
    () => {

        const html =
            readProjectFile(
                "public/index.html"
            );


        assert.equal(
            html.includes(
                'id="messages"'
            ),
            true
        );


        assert.equal(
            html.includes(
                'id="composer"'
            ),
            true
        );


        assert.equal(
            html.includes(
                'id="input"'
            ),
            true
        );

    }
);