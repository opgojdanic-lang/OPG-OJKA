# OPG Ojdanić — Evidencija — upute za postavljanje

Mobilna aplikacija (PWA) za evidenciju prodaje i troškova. Sadrži:
- **Prodaju** za Ribolu i sve 4 mesnice (Đakula, Baričević, Vitić, Bokšić)
- **Troškove** po kategoriji
- **Paula** vođenog posebno — ne ulazi u prihod/dobit, samo se prati koliko mu je
  prodano i je li isplaćeno
- **Pregled** s filterima po mjesecu i izvozom izvještaja (CSV/JSON)
- **Sinkronizaciju uživo** — kad jedan član obitelji doda unos, ostali ga odmah vide

## Korak 1 — Postavljanje besplatne baze (za sinkronizaciju uživo)

Ovo omogućuje da svi telefoni odmah vide iste podatke. Traje cca 5 minuta, radi se
jednom (bilo tko od obitelji to može napraviti):

1. Otvorite [console.firebase.google.com](https://console.firebase.google.com) i
   prijavite se Google računom.
2. **Add project** → upišite naziv (npr. `opg-ojdanic`) → Continue → Create project.
3. U lijevom izborniku: **Build → Firestore Database → Create database** → odaberite
   lokaciju (npr. `europe-west`) → **Production mode** (zadano odbijanje pristupa). Ne uključivati javni test mode za stvarne podatke. Prije povezivanja pregledati [sigurnosni plan](docs/SECURITY-RELEASE-PLAN.md) i potvrditi ovlasti stvarnih Firebase UID-ova.
4. U lijevom izborniku kliknite **⚙ Settings** (odmah ispod "Project Overview") →
   **Project settings** → dolje pod "Your apps" kliknite ikonu **`</>`** (Web) →
   nazovite je "OPG" → Register app.
5. Pojavit će se kod s `const firebaseConfig = { ... }` — kopirajte cijeli taj blok.

Kad prvi put otvorite aplikaciju (nakon postavljanja hostinga, korak 2), zalijepite taj
kod u ekran za povezivanje koji se sam pojavi. Nakon toga aplikacija se sama povezuje na
svakom uređaju koji koristi istu poveznicu — ponovno povezivanje / promjenu po potrebi
radite preko zupčanika (⚙) gore desno u zaglavlju.

 > **O sigurnosti:** Firebase web config nije tajna i ne štiti pristup bazi. Pristup određuju Firestore pravila i autentikacija. Ne koristite javno pravilo `allow read, write: if true`. Anonimni UID može se povezati s Google računom, ali anonimna prijava nema poslovni pristup. Konačni pristup zahtijeva serverski odobrenu Google OWNER/MEMBER ulogu. Prije promjene pravila pregledajte postojeće korisnike i način pristupa kako se obitelji ne bi prekinula sinkronizacija.

## Nadogradnja Zalihe / FIS

U Zaštita → Zalihe / FIS povežite proizvod s točnim FIS zapisom. Ručna provjera prikazuje registrirane primjene, karencu u izvornom tekstu i promjene od prethodnog uspješnog dohvata. Neuspješne ili zastarjele provjere su označene. Ovo nije preporuka primjene niti potvrda da je berba dopuštena.

Pozadinsko dnevno provjeravanje koristi zasebni Firebase codebase i zahtijeva postavljanje u Firebaseu. Firebase koraci: [docs/FIREBASE-FIS.md](docs/FIREBASE-FIS.md).

AI analiza fotografija ima zasebno postavljanje ključa, dopuštenih uređaja i ograničenja od 100 pokušaja mjesečno: [docs/FIREBASE-PEST-AI.md](docs/FIREBASE-PEST-AI.md).

Provjere: `node --test tests/*.test.cjs`. Preglednički scenarij: uz instaliran Playwright i Chromium pokrenuti `node tests/fis-browser.cjs`; sam pokreće lokalni server na portu 8766. Scenarij koristi ogledne podatke i simulirane FIS/Firebase AI odgovore, bez naplate analize.

## Korak 2 — Postavljanje same aplikacije (hosting)

Da bi se aplikacija mogla **instalirati na telefon**, mora biti postavljena na neko web
mjesto — to je pravilo svih preglednika.

**Najlakše — GitHub Pages (besplatno):**
1. Napravite račun na [github.com](https://github.com) ako ga nemate.
2. "New repository" → nazovite ga npr. `opg-ojdanic` → Public.
3. Učitajte sve datoteke iz ove mape (`index.html`, `manifest.json`, `sw.js`, `icons/`)
   — gumb "Add file → Upload files".
4. **Settings → Pages** → Branch: `main` → Save.
5. Za par minuta aplikacija je dostupna na:
   `https://vaše-korisničko-ime.github.io/opg-ojdanic/`

**Alternativa — Netlify Drop (bez računa, još brže):**
Otvorite [app.netlify.com/drop](https://app.netlify.com/drop) i povucite cijelu mapu
`opg-pwa` u prozor preglednika — odmah dobijete javnu poveznicu.

## Korak 3 — Instalacija na telefon

**Android (Chrome):** otvorite poveznicu → izbornik (⋮) → "Dodaj na početni zaslon" /
"Instaliraj aplikaciju".

**iPhone (Safari):** otvorite poveznicu → gumb Podijeli → "Dodaj na Home Screen".

Aplikacija dobiva ikonu s vašim logom na početnom ekranu i otvara se preko cijelog
ekrana, bez adresne trake — kao svaka druga instalirana aplikacija.

## Kako prepoznati je li sinkronizacija uživo aktivna

U zaglavlju aplikacije, ispod naziva "OPG Ojdanić", piše status:
- 🟢 **"Uživo · svi vide isto"** — spojeno na zajedničku bazu, svi unosi se odmah dijele
- ⚪ **"Lokalno (bez sinkronizacije)"** — podaci ostaju samo na ovom telefonu

## Sadržaj mape

- `index.html` — aplikacija bez ugrađenih privatnih početnih podataka; postojeće evidencije čitaju se iz lokalne pohrane ili odobrene zajedničke baze
- `manifest.json` — podaci za instalaciju (ime, ikona, boje)
- `sw.js` — service worker za rad bez interneta
- `icons/` — ikona aplikacije (vaš logo OPG Ojdanić)

## Kandidat za sigurnu objavu

Aktualni pregled pravila, osjetljivih početnih podataka, povezivanja Laser SC i kontroliranog redoslijeda objave: [SECURITY-RELEASE-PLAN.md](docs/SECURITY-RELEASE-PLAN.md). Kandidat nije produkcijski objavljen.

Google prijava, ovlasti i obavezne provjere prije produkcije: [docs/GOOGLE-AUTH.md](docs/GOOGLE-AUTH.md).

Konačni OWNER/MEMBER model, hitno zatvaranje širokih pravila i oporavak: [docs/ROLE-ROLLOUT.md](docs/ROLE-ROLLOUT.md).

Prije migracije: [operatorske provjere i privatni izvoz](docs/OPERATOR-PREFLIGHT.md), bez deploya i promjene IAM-a.
