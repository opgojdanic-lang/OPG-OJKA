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
   lokaciju (npr. `europe-west`) → **Start in test mode**.
4. U lijevom izborniku kliknite **⚙ Settings** (odmah ispod "Project Overview") →
   **Project settings** → dolje pod "Your apps" kliknite ikonu **`</>`** (Web) →
   nazovite je "OPG" → Register app.
5. Pojavit će se kod s `const firebaseConfig = { ... }` — kopirajte cijeli taj blok.

Kad prvi put otvorite aplikaciju (nakon postavljanja hostinga, korak 2), zalijepite taj
kod u ekran za povezivanje koji se sam pojavi. Nakon toga aplikacija se sama povezuje na
svakom uređaju koji koristi istu poveznicu — ponovno povezivanje / promjenu po potrebi
radite preko zupčanika (⚙) gore desno u zaglavlju.

> **O sigurnosti:** "test mode" znači da bazu može čitati/pisati bilo tko tko ima vaš
> config kod (ne i slučajni prolaznici — config nije javno vidljiv nigdje dok ga sami ne
> podijelite). Sasvim je u redu za obiteljsku evidenciju ovog opsega; samo ne dijelite
> config izvan obitelji. Firestore test mode inače istječe za 30 dana — ako se to dogodi,
> vratite se u Firestore Database → Rules i postavite:
> ```
> rules_version = '2';
> service cloud.firestore {
>   match /databases/{database}/documents {
>     match /{document=**} { allow read, write: if true; }
>   }
> }
> ```

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

- `index.html` — sama aplikacija (uključuje već prebačene podatke iz vaše Excel tablice)
- `manifest.json` — podaci za instalaciju (ime, ikona, boje)
- `sw.js` — service worker za rad bez interneta
- `icons/` — ikona aplikacije (vaš logo OPG Ojdanić)
