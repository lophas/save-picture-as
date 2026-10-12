# Save picture as

Egyszerű, Manifest V3-as Chrome-bővítmény: jobb kattintás egy képen → **Save picture as** → **WebP / JPG / PNG**. A mentési ablakban az eredeti fájlnév jelenik meg, a választott formátum kiterjesztésével. A képtartalom ténylegesen konvertálódik.

## Telepítés

1. GitHubon **Code → Download ZIP**, majd csomagold ki.
2. Nyisd meg a `chrome://extensions` oldalt, és kapcsold be a **Developer mode / Fejlesztői mód** kapcsolót.
3. **Load unpacked / Kicsomagolt bővítmény betöltése**: válaszd ki a repó **extension** mappáját.
4. Egy weboldalon kattints jobb gombbal a képre, majd válassz formátumot a **Save picture as** almenüből.

Chrome 116 vagy újabb szükséges. Nincs buildlépés és nincs npm-függőség. Frissítés után a `chrome://extensions` oldalon kattints a bővítmény újratöltésére.

## Működés

- PNG és WebP: átlátszóság megőrzése. JPG: az átlátszó részek fehér hátteret kapnak.
- JPG és WebP: 95%-os kódolási minőség. Az eredeti képméret megmarad.
- HTTP(S), `data:` és `blob:` képek támogatása, köztük a Chrome által dekódolható AVIF, SVG és GIF bemenetek.
- A fájlnév elsőként a szerver `Content-Disposition` fejlécéből, egyébként az URL-ből származik. Név nélküli `data:` és `blob:` kép: `image.jpg`, `image.png` vagy `image.webp`.
- A fájlnevek tiltott karaktereit biztonságos karakter váltja fel; azonos nevű fájloknál Chrome kezeli az ütközést.
- Animált képből egy állókép készül. EXIF/IPTC/metaadatok és az animáció nem kerülnek át a kimenetbe; ez a bővítmény nem archív másolatot készít.
- 32 MB bemeneti fájl- és 40 megapixeles képméretkorlát; a hálózati kérés 20 másodperc után megszakad.
- Hibánál külön lap jelenik meg magyarázattal. A mentési ablak megszakítása normál művelet.

Nyilvános HTTP(S) képeknél először cookie-k nélküli lekérés történik, hogy a `Access-Control-Allow-Origin: *` választ adó CDN-ek is működjenek. Hálózati/CORS-hiba vagy 401/403 válasz esetén külön, cookie-kat is használó kéréssel próbálkozik. Az oldalon futó tartalék lekérés először `same-origin` módban fut: az oldal saját domainjén megtartja a bejelentkezést, más domainre nem küld cookie-t.

Az oldalhoz kötött Blob URL-t a kattintott iframe-ből olvassa ki. Ha a közvetlen HTTP-kérés sikertelen, ugyanabban a frame-ben próbálkozik újra. A bejelentkezési cookie-k, CORS-szabályok, lejárt URL-ek, hotlinkvédelem vagy a weboldal saját korlátozásai miatt egyes képek nem hozzáférhetők. Chrome belső lapokon és más védett oldalakon a bővítmény nem tud az oldalba kódot injektálni.

## Jogosultságok és adatvédelem

- `contextMenus`: képre vonatkozó jobbklikkes almenü.
- `downloads`: rendszer mentési párbeszédablaka és letöltési állapot.
- `offscreen`: Canvas-konverzió egy rejtett bővítménydokumentumban.
- `scripting`: a felhasználó által kiválasztott kép kiolvasása az eredeti frame-ben, ha szükséges.
- `storage`: csak a folyamatban lévő letöltések Blob URL-jei a munkamenet memóriájában; a letöltés végén törlődnek.
- HTTP/HTTPS hosthozzáférés: külön domainen/CDN-en tárolt képek letöltése és iframe-ekben lévő Blob képek elérése. Telepítéskor Chrome emiatt széles webhely-hozzáférési engedélyt jelez. A bővítmény nem futtat állandó content scriptet: csak a menüpont kiválasztásakor dolgozik.

Nincs backend, analitika, követés vagy külső konverziós szolgáltatás. Az eredeti képet a saját kiszolgálójáról tölti le, a konverzió helyben történik. Nincs távoli JavaScript.

## Fejlesztés és csomagolás

```sh
npm test
npm run package
```

A `dist/save-picture-as-1.0.1.zip` közvetlenül az extension fájljait tartalmazza. Csomagold ki, és a kapott mappát töltsd be. A GitHub Actions minden push/PR után tesztel és készít egy letölthető ZIP-artifactot. A `v*` tag workflow ugyanezt a ZIP-et GitHub Release-hez csatolja.

A Node-tesztek fájlneveket, bemeneti korlátokat, képdekódolási/Canvas hibákat és letöltési életciklust ellenőriznek mock API-kkal. Valódi Chrome-ban a `tests/manual.md` ellenőrzőlistát használd.

## Licenc

A repó meglévő [GPL-3.0 licence](LICENSE) vonatkozik a kódra.
