# Google autentifikacija — provjera prije produkcije

Stanje: 27. listopada 2026.; Draft PR #2. Ništa nije objavljeno, spojeno, dodijeljeno stvarnim korisnicima niti promijenjeno u produkcijskim pravilima. Ovaj dokument dopunjuje [sigurnosni plan](SECURITY-RELEASE-PLAN.md) i zamjenjuje njegove pretpostavke o isključivo anonimnoj prijavi.

## Identitet i ovlasti

`auth.js` dodaje eksplicitnu anonimnu prijavu, Google popup prijavu, povezivanje postojećeg anonimnog računa, odjavu, prikaz imena/e-pošte/UID-a i sigurne hrvatske poruke. Prijava sama ne daje pristup poslovnim podacima. Nakon odjave ili praznog početnog stanja aplikacija ne stvara automatski novi anonimni UID.

Postojeći anonimni račun povezuje se kroz `linkWithPopup`: uspjeh mora zadržati isti UID. Kod već zauzetog Google računa aplikacija ne prelazi automatski na taj račun, ne briše korisnika i ne spaja podatke. Korisnik mora prvo zabilježiti UID i zatražiti provjeru vlasništva. Gubitak pregledničke pohrane prije povezivanja može onemogućiti povrat anonimnog identiteta; UID nije lozinka ni dokaz vlasništva.

Ovlasti dolaze isključivo iz serverski potvrđenog `access_members/{uid}` dokumenta predloženih pravila. `enabled:true` i konkretni poznati `permissions` potrebni su za svaki opseg. `administrator:true` je prikazna oznaka, nije zaobilaženje pravila. Google provider, e-mail domena, klijentski flag ili custom claim sami ne otključavaju podatke. Anonimni korisnik može imati samo pojedinačno prethodno odobrene opsege. Zasebni serverski AI allowlist ostaje odvojen; Google/admin status ga ne zamjenjuje. Mjesečna kvota 100 i evidencija troška nisu promijenjene.

Aplikacija čeka serverski ACL; predmemorirani ACL ili lokalni pending zapis ne otključava pristup. Pretplate se pokreću samo za dopuštene kolekcije. Promjena UID-a/odjava odvaja čitače, uklanja privatni prikaz, obrasce i AI/FIS rezultate; zakašnjeli odgovori starog računa ignoriraju se. Isti UID pri Google povezivanju zadržava nespremljeno opažanje. Već poslani zahtjev može završiti prema prethodnim serverskim ovlastima; odjava nije otkaz transakcije.

Nema brisanja ni automatskog uvoza postojećih Firestore dokumenata. Lokalni stari zapisi i IndexedDB ostaju sačuvani, ali konfigurirana aplikacija ih ne prikazuje kao podatke drugog računa. Nova opažanja i postavke doziranja imaju UID ključ. Stari nepridruženi lokalni ključevi zahtijevaju zasebnu provjeru vlasnika prije oporavka; ne čistiti browser storage. Novi Firestore klijent koristi memorijski cache. Postojeća Auth persistence nije promijenjena.

## GitHub Pages, popup i iPhone Safari

Korisnik je potvrdio omogućene Google i Anonymous providere te Authorized domain `opgojdanic-lang.github.io`; te postavke nisu pročitane iz produkcijske konzole ovim radom.

Na sadašnjem GitHub Pages hostu koristi se popup pokrenut izravnim klikom. Nema automatskog prelaska na redirect nakon blokiranog popupa. Korisnik dobiva jasnu poruku i može ponovno pokušati u Safariju. Safari tab i instalirani PWA mogu imati odvojenu pohranu/anonimne UID-eve: povezivati račun u kontekstu u kojem su postojeći podaci. Privatni način, blokiranje popupa i ograničenja pohrane treba provjeriti na stvarnom uređaju.

Authorized domains samo dopušta origin; ne rješava cross-origin redirect helper storage. Provjera `https://opgojdanic-lang.github.io/__/auth/handler` vratila je HTTP 404. Ne postavljati slijepo GitHub host kao `authDomain`. Projektni Pages put `/OPG-OJKA/` ne isporučuje sam OAuth helper na korijenskom `/__/auth/` putu, a Pages nema transparentni reverse proxy.

[Firebase službene upute](https://firebase.google.com/docs/auth/web/redirect-best-practices) navode popup (opcija 2), transparentni proxy (3, ne HTTP 302), održavano samostalno posluživanje helpera (4, s ograničenjima) ili istu domenu na Firebase Hostingu (1). Ovdje je odabrana opcija 2. Sigurna alternativa ako stvarni Safari/PWA popup nije prihvatljiv jest zasebno pregledan prelazak na Firebase Hosting s istom domenom aplikacije i auth helpera; ne uvoditi improvizirani redirect na Pagesu.

Implementirani redirect gumb ostaje onemogućen na Pagesu. Kod ga dopušta samo na istom HTTPS originu `opg-ojka.firebaseapp.com` ili `opg-ojka.web.app` s odgovarajućim `authDomain`. Čuva namjeru/UID u sessionStorage, provjerava rezultat prije učitavanja poslovnih podataka i odbija promijenjeni UID pri povezivanju. To je zaštitna priprema, ne dokaz da je budući Hosting konfiguriran. Prije omogućavanja provjeriti stvarni `/__/auth/handler`, javni Firebase web config, OAuth redirect URI u Google Cloud konzoli, consent screen/test users, povrat u PWA i ponašanje nakon prekida navigacije. Samostalni custom-domain/proxy postupak nije implementiran.

## Početno dodjeljivanje administratora — samo ovlašteni operator

Nema klijentskog administratorskog endpointa ni automatskog prvog administratora. `scripts/grant-administrator.cjs` pokreće se samo na pouzdanom operatorskom računalu s odobrenim ADC/IAM pristupom Firebase Auth i ciljanim Firestore dokumentima. Ne spremati service-account JSON u repo, web direktorij ili chat. Ne pokretati ovaj postupak u setupu/CI-ju.

1. Vlasnik neovisno provjerava osobu, projekt i Firebase UID. Korisnik se prijavi Googleom i vidi UID čak i bez poslovnih ovlasti. Kod anonimnog povezivanja usporediti UID prije/poslije.
2. Pregledati stvarna pravila i postojeći ACL. Prvo osigurati da klijent ne može pisati `access_members`; inače registry nije pouzdan. Dogovoriti prozor održavanja i prava najmanjeg opsega. Ne otvarati bazu radi bootstrap grešaka.
3. Instalirati backend zaključane ovisnosti; prvo izvršiti samo čitanje (zamijeniti `VERIFIED_UID` stvarnim provjerenim UID-em):

```sh
node scripts/grant-administrator.cjs --project opg-ojka --uid VERIFIED_UID --permissions finance_read,inventory_read
```

CLI preko Admin SDK-a provjerava da je korisnik omogućen, ima verificiranu e-poštu i Google provider. To tehničko svojstvo nije zamjena za neovisnu provjeru vlasnika. Default je dry-run bez pisanja. Pregledati popis: postojeći poznati opsezi se zadržavaju, nepoznati/neispravni se odbijaju; ovo nije alat za opoziv ovlasti. Cijeli katalog je `PERMISSIONS` u `auth.js`; dodavati samo potrebne opsege, ne slijepo cijeli popis.

4. Tek uz zasebno odobrenje operator može ponoviti istu naredbu s `--apply --confirm-project opg-ojka --confirm-uid VERIFIED_UID`. To transakcijski spaja samo zaštićeni ACL dokument. Ne mijenja poslovne dokumente, tajne, AI allowlist ili custom claims. Nijedan takav stvarni poziv nije izvršen ovim PR-om.
5. Neovisno provjeriti spremljeni dokument i prijavu; kliknuti osvježavanje ovlasti. Testirati odbijen Google račun, dopuštene i nedopuštene opsege, odjavu, opoziv `enabled` te zasebno AI pristup. Ne zaključivati o pravima iz same administratorske oznake.

## Testovi i granice dokaza

- `node --test tests/*.test.cjs`: 54 testa, uključujući povezivanje, konflikt bez automatskog prelaska, karantenu promjene UID-a, odjavu, redirect ograničenja, sanitizirane greške i operatorski plan.
- `tests/auth-emulator.cjs`: pravi Firebase Web SDK 10.12.2 i lokalni Auth emulator; anonimni UID ostaje pri Google credential linku, odjava i novi anonimni račun su odvojeni, konflikt čuva anonimni identitet. Sintetički Google tokeni vrijede samo u emulatoru; ovo ne testira Google consent/popup mrežu.
- `tests/pest-ai-rules.cjs`: 76 dopuštenih / 310 odbijenih operacija, uključujući anonimnog korisnika, Google bez ovlasti, administratora sa serverskim opsezima, zabranu samododjele ACL-a i privatne AI evidencije; stvarne emulator transakcije kvote.
- `tests/auth-browser.cjs`: cijela aplikacija u Chromiumu i WebKitu s lažnim Firebase/OAuth adapterima; svi moduli, povezivanje istog UID-a, Google bez ovlasti, admin, promjena računa, zakašnjeli callbackovi, odjava/reload i očuvanje stare lokalne pohrane.
- `tests/fis-browser.cjs`: FIS/AI funkcionalni i mobilni testovi s lažnim mrežnim odgovorima, uključujući sintetičke safe-area insets. WebKit emulacija nije fizički iPhone Safari.
- Frontend testovi provjeravaju CSP, zabranu privatnih ključeva/Admin SDK-a i prava u browser assetima. Firebase javni web `apiKey` nije administratorska tajna. `OPG_OPENAI_API_KEY` ostaje serverski. Statički frontend nema build korak; provjeravaju se testovi i učitavanje Functions entry pointa.

Ponovljive naredbe uz Node 22, instalirane zaključane backend ovisnosti i vanjske razvojne alate:

```sh
node --test tests/*.test.cjs
# Auth emulator mora biti zaseban demo projekt i localhost, nikad produkcija:
# firebase-tools 14.27.0; Web SDK 10.12.2 u zasebnom vanjskom node_modules direktoriju
firebase emulators:start --only auth --project demo-opg-auth --config firebase.auth-emulator.json
# U drugom terminalu; NODE_PATH pokazuje na direktorij sa SDK 10.12.2:
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tests/auth-emulator.cjs
# Firestore emulator i reprodukcija opisani su u SECURITY-RELEASE-PLAN.md.
CHROMIUM_PATH=/usr/bin/chromium node tests/auth-browser.cjs
BROWSER_ENGINE=webkit node tests/auth-browser.cjs
CHROMIUM_PATH=/usr/bin/chromium SAFE_AREA_TEST=1 node tests/fis-browser.cjs
BROWSER_ENGINE=webkit SAFE_AREA_TEST=1 node tests/fis-browser.cjs
```

## Obavezno prije produkcije

Prvo provjeriti stvarne Auth korisnike, produkcijska pravila, ACL/IAM, web config i preostale privatne povijesne Git/web artefakte prema sigurnosnom planu. Produkcijski ADC nije valjan u ovom okruženju; stvarni ACL, postojeća pravila i stvarno Laser SC povezivanje nisu potvrđeni. Nema dokaza da je stvarna Google OAuth prijava prošla. Potrebna je odvojena staging provjera s pravim računima i fizičkim iPhoneom, uključujući PWA, blokirani/zatvoreni popup, UID prije/poslije, zauzeti Google račun, nedopušten račun, administratora i opoziv ovlasti. Odvojeni staging Firebase projekt/profil sprječava nenamjernu odjavu produkcijskih tabova koji dijele Auth storage.

Nakon tih provjera i posebnog odobrenja slijediti redoslijed sigurnosnog plana: zaštititi registry pregledanim pravilima prije dodjele, objaviti usklađeni frontend, kontrolirano dodijeliti provjerene UID opsege i provjeriti pristup. Google dodatak ne zahtijeva novu Function niti promjenu tajni; cijeli PR ranije mijenja `fisSyncDaily`, `pestPhotoAnalyze` i `pestPhotoUsage`, koje imaju zaseban pregledani deploy korak. Sadašnji frontend objavljuje se kroz GitHub Pages; Firebase Hosting nije potreban za popup. Opcionalni Hosting prelazak zahtijeva zasebnu konfiguraciju i odobrenje. Nijedan deploy/merge nije izvršen.
