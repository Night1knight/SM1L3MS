# Secure Carrier

WhatsApp benzeri geçici mesajlaşma uygulaması prototipi.

## Özellikler

- Gerçek zamanlı WebSocket mesajlaşması
- WhatsApp benzeri mesaj baloncukları
- Sohbet kodu oluşturma
- Sohbete kod ile katılma
- Yazıyor göstergesi
- Responsive arayüz
- Tarayıcı tarafında AES-GCM şifreleme
- Relay sunucusunda plaintext mesaj bulunmaması
- Geçici sohbet odaları
- 30 dakika aktivite olmazsa oda temizleme

## Kurulum

Node.js 18 veya üzeri gerekir.

Terminal:

npm install

Sonra:

npm test

Ardından:

npm start

Tarayıcı:

http://localhost:3000

## İki kullanıcıyla test

1. İlk tarayıcıda "Yeni Sohbet" seç.
2. Oluşan sohbet kodunu kopyala.
3. İkinci tarayıcıda aynı siteyi aç.
4. "Sohbete Katıl" seç.
5. Sohbet kodunu gir.
6. Mesaj gönder.

## Güvenlik

Bu sürüm prototiptir.

AES-GCM anahtarı şu anda tarayıcı oturumunda oluşturulmaktadır. İki farklı cihaz arasında güvenli anahtar değişimi henüz uygulanmamıştır.

Üretim sürümünden önce:

- güvenli anahtar değişimi
- HTTPS/WSS
- kimlik doğrulama
- replay saldırısı koruması
- rate limiting
- daha güçlü oda yaşam döngüsü
- güvenli davet bağlantıları
- mesaj metadata minimizasyonu

eklenmelidir.