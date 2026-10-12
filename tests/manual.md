# Chrome ellenőrzőlista

A repó `extension` mappáját töltsd be a chrome://extensions oldalon. Ez a lista valódi Chrome-ellenőrzéshez készült; a Node-tesztek API-mockokat használnak.

- [ ] JPEG → PNG/WebP/JPG: a mentési ablak megnyílik, eredeti név, helyes méret és tényleges MIME/formátum.
- [ ] Átlátszó PNG → PNG/WebP: alfa megmarad; PNG → JPG: fehér háttér.
- [ ] AVIF bemenet minden kimenethez, SVG és GIF bemenethez állókép készül.
- [ ] Más domainen/CDN-en lévő kép és query stringes URL.
- [ ] UTF-8 Content-Disposition név elsőbbsége; ékezetes URL-név.
- [ ] Data URL kép, illetve JS-sel létrehozott Blob URL kép.
- [ ] Blob URL kép más originű iframe-ben: a kattintott frame-ből olvassa ki.
- [ ] Több gyors mentés, a munkamenetben tárolt URL-ek a letöltés végén törlődnek.
- [ ] Save As megszakítás: nem jelenik meg hibalap.
- [ ] Lejárt/403 URL és nem dekódolható bemenet: olvasható hibalap.
- [ ] 32 MB / 40 MP limit, már létező fájlnév és szóközös fájlnév.
- [ ] A service worker leállítása után új mentés és befejezett letöltés takarítása.
