# Sigurnosni pregled i uvjeti produkcijske objave — PR #2

Ovo je priprema, ne odobrenje objave. Pravila nisu primijenjena, članovi nisu dodani u produkciju, postojeći dokumenti nisu mijenjani i PR nije spojen.

## Što je potvrđeno, a što nije

U repozitoriju postoji jedan skup pravila: `backend/firestore-fis.rules.proposed`. `firebase.ai-emulator.json` učitava taj skup u demo emulator. Korijenski `firebase.json` i dalje cilja samo dva Functions codebasea. Nova odvojena konfiguracija `firebase.security-review.json` služi isključivo za kasnije odobreni deploy pregledanih pravila; ništa je ne izvršava automatski.

Nije bilo moguće pročitati **važeća produkcijska pravila**, Auth korisnike, postojeći eventualni vanjski registar ovlasti, dokument Laser SC, stvarne postavke niti objavljene Functions konfiguracije: dostupne ADC vjerodajnice vraćaju `app/invalid-credential`. Pregled datoteke `.proposed` nije pregled produkcijskog stanja. Potrebno je izvesti važeća pravila i usporediti ih prije aktivacije.

Kod potvrđuje `signInAnonymously`, zajedničke kolekcije i lokalno ime `currentUser`/polje `unio`. To ime nije Auth identitet ni dokaz vlasništva. Postojeći `ai_private/config.allowedUids` vrijedi za AI i **nije** dokaz ovlasti za financije. Nema potvrđenog modela vlasništva poslovnih zapisa niti potvrđenog registra poslovnih članova u repozitoriju.

## Novi prijedlog ovlasti — nema automatskog odobravanja

Kandidat uvodi **novi** registar `access_members/{FirebaseAuthUid}` s `enabled: true` i popisom `permissions`. To je izričit prijedlog, a ne tvrdnja da takva kolekcija ili korisnička struktura već postoji. Nijedan stvarni UID nije pretpostavljen, ugrađen u kod ili upisan. Ako postoji vanjski odobreni registar, prije objave uskladiti kandidata s provjerenim izvorom umjesto stvaranja paralelne vlasti.

Registar smije pisati samo privilegirani Admin SDK/konzola. Klijent može dohvatiti samo vlastiti zapis ovlasti; ne može popisati članove, sam sebe odobriti ili promijeniti dozvole. Bez zapisa, uz `enabled: false`, pogrešan oblik podataka ili bez odgovarajućeg dopuštenja pristup je odbijen. Sama prijava, anoniman UID, tekst imena ili klijentska tvrdnja `admin` ne daju prava.

| Kolekcije / dokumenti | Dopuštenja i operacije klijenta |
|---|---|
| `prodaja`, `troskovi` | `finance_read`: dohvat/upit; `finance_write`: create/update/delete |
| `zalihe` | `inventory_read`, `inventory_write` |
| `prskanje` | `treatments_read`, `treatments_write` |
| `licences` (ime/OIB/vjerodajnice) | `licenses_read`, `licenses_write` |
| `parcele`, `sjetva_sadnja`, `plan`, `plan_status`, `rokovi` | `farm_read`, `farm_write` |
| `aktivnosti` | Čitanje traži `activities_read` i **sva** poslovna read dopuštenja jer stari tok miješa financijske i osobne podatke. `activities_create` dopušta samo dodavanje s vlastitim stvarnim `auth_uid`; nema klijentskog mijenjanja/brisanja. Tekst događaja nije autoritativni serverski audit. |
| `settings/app` | `settings_read`: get; `settings_manage`: stvaranje/izmjena samo postojećih podržanih postavki; nema popisa/brisanja |
| `settings/spray_conditions` | `protection_read`: get; `settings_manage`: samo tri poznate postavke |
| `settings/weather_live`, `settings/rizik` | `protection_read`: get; klijentsko pisanje zabranjeno |
| `settings/fis_sync` i ostali nepoznati settings | Klijentski pristup zabranjen; operativne kontrole mijenja samo ovlašteni administrator kroz potvrđeni postupak |
| `fis_cache` | `protection_read`: get/list; nema klijentskog pisanja/brisanja ni pristupa podkolekcijama versions koje UI ne čita |
| `fis_sync_status/daily` | `protection_read`: get; nema list/write |
| `ai_private/**` | Sve klijentsko čitanje/pisanje zabranjeno, uključujući poslovnog administratora; callable koristi postojeći zasebni AI allowlist |
| `fcm_tokens` | `notifications_write`: registracija vlastitog tokena s `auth_uid`; izmjena/brisanje samo istog potvrđenog vlasnika; nema klijentskog čitanja/popisivanja. Stari tokeni bez vlasnika ne mogu se preuzeti; merge registracija čuva nepoznata serverska polja, koja klijent ne može mijenjati. |
| Sve nepoznate kolekcije i poslovne podkolekcije | Zadano odbijanje |

Read i write dopuštenja su odvojena; nije uvedena pretpostavka da svi članovi trebaju sve podatke. Ne dodavati sve dozvole svim anonimnim uređajima samo da nestanu greške. Kod zadržava postojeći način autentifikacije; dugoročna zamjena anonimne prijave stabilnim računima zasebna je odluka.

## Kompatibilnost i migracijske granice

- Poslovni dokumenti ne dobivaju izmišljeni `ownerId`. Stari `unio`, datumi, brojčani FIS ID-jevi, količine, privici i dodatna polja ostaju podržani. Ovlasti vrijede za potvrđeni zajednički opseg, ne za navodnog vlasnika pojedinog zapisa.
- `settings/app` je zajednički dokument, ne osobna korisnička postavka. Lokalne postavke u localStorageu nisu zaštićene Firestore pravilima. Nepoznato postojeće settings polje može ostati nepromijenjeno pri izmjeni dopuštenog polja, ali ga klijent ne može dodati/promijeniti/obrisati. Stvarni sadržaj postavki treba pregledati prije dodjele `settings_read`, jer pravila ne mogu sakriti samo jedno polje dokumenta. Eventualne stare tajne premjestiti u odgovarajuću serversku pohranu zasebnim odobrenim postupkom, bez ispisivanja vrijednosti.
- Aplikacija šalje stvarni Auth UID uz nove aktivnosti i FCM registraciju. Stari FCM dokumenti nemaju dokaz vlasnika: administrator mora potvrditi uređaj i izvršiti posebno odobrenu migraciju ili ponovnu registraciju. Nema automatskog preuzimanja tokena prema imenu korisnika. Stariji frontend bez `auth_uid` neće moći pisati te zapise nakon aktivacije kandidata.
- Postojeće sučelje zajedničke aplikacije pokušava čitati više modula. Djelomična dopuštenja namjerno odbijaju ostale kolekcije; prije objave testirati stvarne odobrene opsege i prikaz uskraćenih modula na probnom projektu. Ovaj prijedlog ne tvrdi da postoji dovršen model uloga ili posebno sučelje za svaku ulogu.
- Oduzimanje udaljenih ovlasti ne briše podatke koje je uređaj ranije legitimno preuzeo u localStorage/IndexedDB. Potrebna je politika pristupa uređajima i odobreno postupanje s lokalnim kopijama. Brisanje lokalnih podataka/anonimne Auth pohrane može stvoriti novi UID, koji se ne odobrava automatski. Za potpuni opoziv uređaja pregledati i zasebni AI allowlist i FCM registraciju.
- Ne dodavati samo `allow ...: if false` preko starog širokog wildcarda. Firestore dopuštenja zbrajaju se; pregledani kandidat mora zamijeniti/ograničiti sva preklapajuća dopuštajuća pravila.

## Privatni podaci u frontend artefaktu

Pronađena su 82 + 44 ugrađena prodajna zapisa s količinama/cijenama, jedan zapis vjerodajnice s nepraznim OIB-om i tri početna zapisa parcela. Nije potvrđeno jesu li svi stvarni; ne tretiraju se kao javni demo podaci bez potvrde. Firestore pravila ne štite sadržaj HTML-a.

Početni podaci uklonjeni su iz distribucijskog HTML-a, kao i automatsko dodavanje početnih zapisa lokalno i u zajedničku bazu. Postojeće lokalne evidencije i Firestore podaci nisu brisani. Privatna kopija originalnih inicijalnih blokova sačuvana je izvan checkouta u `/workspace/.private/opg-review/legacy-seeds.js` (direktorij 0700, datoteka 0600). Ne uključivati je u web artefakt, javni repozitorij, izvještaje ni dijeljenu sliku razvojnog okruženja; vlasnik treba potvrditi siguran način zadržavanja prije dijeljenja okruženja.

Service worker v26 zamjenjuje prethodne app asset cacheove, uz očuvanje cacheova drugih aplikacija. To ne briše financijsku localStorage evidenciju. Stare Git commitove, već preuzete kopije, Pages/CDN artefakte i stare uređaje običan commit ne može opozvati. Ako je riječ o stvarnim privatnim podacima, vlasnik mora odlučiti o obradi prethodnih izlaganja i zasebno odobrenom čišćenju povijesti/objavljenih kopija. Povijest nije prepisivana niti force-pushana.

Dodatno je uklonjen `new Function` iz unosa Firebase konfiguracije: prihvaća se podatkovni JSON/službeni console objekt s tekstualnim vrijednostima u dvostrukim navodnicima, ne JavaScript izrazi. CSP zabranjuje proizvoljne inline handlere/eval i dopušta hash pregledanog app skripta te potrebne postojeće SDK izvore. Tekst aktivnosti prikazuje se kroz DOM textContent; izravni tekstualni interpolirani podaci u poslovnim prikazima kodiraju se. To je zaštita od dokazanih injekcija i dodatna zaštitna politika, ne tvrdnja o potpunom penetracijskom testu svih modula. Pri izmjeni inline aplikacijskog koda pokrenuti `node scripts/update-csp.cjs`; test odbija zastarjeli hash. Instalacija okruženja ne smije automatski mijenjati praćeni HTML.

## Laser SC: povezivanje uz dokaz izvora i potvrdu etikete

Stvarni FIS GET za ID 374 provjeren je: `LASER`, status `REGISTRIRAN`, formulacija `koncentrat za suspenziju`. To potvrđuje sadržaj javnog FIS zapisa, **ne identitet ili postojeću vezu stvarne zalihe**.

Odabir retka kataloga više ne sprema vezu. UI dohvaća detalj i provjerava slaganje kataloga s nazivom proizvoda. Za lokalni naziv `Laser SC` traži LASER, ID 374 i izričitu SC formulaciju iz izvora. Prikazuje naziv, registracijski broj, formulaciju, izvor i vrijeme. Korisnik mora usporediti etiketu i izričito potvrditi. Nepoznata formulacija, EC/druga formulacija, pogrešan ID/naziv ili nepotvrđena registracija blokiraju spremanje. Nepoznati sinonimi drugih sredstava nisu automatske veze.

Pri potvrdi ponovno se dohvaća FIS i provjerava nije li promijenjena zaliha ili izvor. Promijenjeni FIS detalj poništava potvrdu; ne sprema se stari odabir. Tek potom postojeći callback koristi `updateDoc` za FIS polja i novu mapu `fis_link_verification` (izvor, naziv zalihe/proizvoda, ID, registracija, formulacije, vrijeme, metoda). Količine i privici ne prepisuju se. To je korisnikova potvrda etikete, ne kriptografski serverski certifikat ni odobrenje tretiranja.

Stari ID 374/string "374" ostaje čitljiv, ali bez potvrde identiteta/formulacije jasno je neprovjeren. Prijedlozi isključuju neprovjereno povezivanje i neaktualni FIS zapis. Promjena naziva/registracije/formulacije zahtijeva ponovnu provjeru. Nema automatske migracije produkcijskih veza. Ručne korake iz `PROTECTION-FINAL-CHECK.md` dopuniti ovom potvrdom etikete i provjerom nove mape; stvarni dokument i ovlasti tek treba potvrditi.

## Izvršene provjere

- Node 22: **41 test**, bez preskočenih; FIS/AI kvota i trošak, sigurni parser konfiguracije, frontend granica tajni, odsutnost privatnog seeda, CSP hash i osvježavanje asset cachea.
- Pravi lokalni Firestore emulator, projekt **demo-opg-ai**: **69 dopuštenih i 292 odbijene operacije** u matrici ovlasti. Dodatno stvarne Admin SDK transakcije: četiri istodobna AI zahtjeva pri 99/100 dopuštaju točno jedan provider poziv i završavaju na 100. Sve je na demo bazi, s lažnim providerom i lažnim podacima.
- Chromium i WebKit/iPhone emulacija: postojeći FIS/AI scenariji, potvrda povezivanja, LASER pogrešna/izmijenjena formulacija bez pisanja, stare veze bez potvrde, očuvanje količina/lokalnih financija, tekstualne aktivnosti/financije i blokirani inline handler, širine 320–430 px i safe-area 47/34 px. Fizički iPhone još nije potvrđen.
- JS sintaksa i `git diff --check`. Nema frontend build koraka. Nisu mijenjani manifesti, lockfileovi, Firebase tajne ili postojeća autentikacija. Frontend ne sadrži OpenAI/provider tajnu. Firebase web config i VAPID javni ključ nisu tajne za autorizaciju baze; stvarne udaljene postavke nije bilo moguće pregledati.

Emulator je sada uspješno preuzet i testovi pravila izvršeni; stariji izvještaji s HTTP 403 opisuju prethodno stanje i više nisu aktualni za lokalne testove. Emulator ne potvrđuje produkcijska pravila, stvarne članove, IAM, tajne ni šest starih Functions koje nisu u ovom repozitoriju.

## Točan redoslijed objave — tek nakon zasebnog odobrenja

1. **Inventar i sigurnosna odluka:** izvesti produkcijska pravila, potvrditi projekt/bazu/Auth korisnike, sve postojeće klijente, stare Functions i kolekcije izvan repozitorija. Potvrditi je li registar ovlasti već negdje održavan. Provjeriti privatnost ranijeg HTML-a/Git povijesti i postupanje s privatnom lokalnom kopijom. Sačuvati sigurnosne kopije, bez izlaganja tajni. Bez tih podataka nema odobrenja objave.
2. **Odobreni pristupi:** vlasnik po uređaju potvrđuje stvarni Firebase UID i minimalne read/write opsege; imena `unio` ili AI allowlist ne preslikavati automatski. Potvrditi oporavak izgubljenog anonimnog UID-a i pristup administratorskoj konzoli. Ne upisivati produkcijski ACL kroz neprovjereni široki wildcard.
3. **Probni projekt:** učitati kopiju sheme/anonimizirane podatke i pregledana pravila; potvrditi sve stvarno potrebne tijekove za svaki odobreni opseg, offline ponašanje, FCM migraciju, settings polja i FIS dokaz povezivanja. Ponovno izvršiti sve testove. Fizički iPhone/Safari/PWA provjeriti prije odobrenja spajanja. Ne koristiti stvarne financijske podatke kao javni demo.
4. **Odobreno spajanje i termin održavanja:** Pages je vezan uz `main`/`/`, pa merge može odmah pokrenuti objavu. Prvo dogovoriti prozor održavanja i ograničiti upise starih klijenata. Ovaj agent ne spaja PR. Pripremiti siguran rollback; ne vraćati široki wildcard ili HTML s privatnim seed podacima.
5. **Pravila prije dodjele ovlasti:** ovlašteni administrator primjenjuje pregledani skup kroz zasebnu konfiguraciju: `npx firebase-tools deploy --only firestore:rules --config firebase.security-review.json --project opg-ojka`. Provjeriti zatvaranje svih preklapajućih starih allow pravila. Kratki prekid pristupa moguć je i planiran dok članovi nisu potvrđeni/provisionirani; ne otvarati bazu radi uklanjanja grešaka.
6. **Privilegirani bootstrap:** nakon zaštite registra administrator kroz potvrđeni Admin SDK/konzolu dodaje samo odobrene zapise ovlasti, uz zasebnu izričitu potvrdu stvarnih UID-ova i opsega. Potvrditi pozitivne i negativne produkcijske provjere bez stvaranja/brisanjem lažnih poslovnih zapisa. Nova shema nije automatski popunjena ovim PR-om.
7. **Frontend i tokeni:** potvrditi Pages objavu pregledanog HTML/JS/CSS/security.js/sw.js bez seed podataka, ispravan CSP i service worker v26. Stari frontend ne zna `auth_uid` ni novu potvrdu FIS veze, pa treba kontrolirana nadogradnja uređaja u istom prozoru održavanja. Stare FCM tokene mijenjati samo nakon dokaza vlasništva i zasebnog odobrenja. Firebase Hosting nije potreban niti konfiguriran. Nemoj objaviti cijeli `/workspace` ili privatnu sigurnosnu kopiju.
8. **Samo ciljane Functions:** uz postojeći secret/IAM i pregled konfiguracije objaviti `npx firebase-tools deploy --only functions:fis-sync,functions:pest-ai --project opg-ojka`. Time su obuhvaćeni `fisSyncDaily`, `pestPhotoAnalyze`, `pestPhotoUsage`. Ne brisati/zamjenjivati ostale postojeće funkcije. Root functions deploy ne objavljuje pravila. Ako CLI predloži brisanje neplaniranih funkcija, prekinuti.
9. **Provjera nakon objave:** dopušten/odbijen uređaj i svaki opseg; AI private/cache/status zaštita; stvarna Laser SC etiketa i novo eksplicitno povezivanje bez promjene količina; Scheduler samo `fisSyncDaily`, brojači i cache 374; jedna odobrena AI analiza i replay/kvota/trošak; fizički Safari/PWA, lokalne kopije, obavijesti i sigurni izlaz iz održavanja. AI i dnevnu provjeru uključiti samo prema potvrđenom postojećem stanju/odluci; ne resetirati kvotu ni mijenjati tajne automatski.

**Zaključak: aplikacija još nije odobrena za produkciju.** Lokalno su dokazana znatno stroža pravila i sigurniji FIS/klijent, ali stvarne ovlasti, prethodno izloženi podaci, produkcijska konfiguracija i fizički uređaji ostaju prepreke koje zahtijevaju vlasnikovu provjeru i zasebno odobrenje.

## Ponovljive razvojne provjere

U pripremljenom okruženju Node 22 i backend ovisnosti već su instalirani. Nove aplikacijske biblioteke nisu dodane. Pravila se testiraju samo na demo projektu; CLI 14.27.0 provjeren je uz Java 21, rules-unit-testing 3.0.4 i Firebase web SDK 10.14.1. Testne ovisnosti mogu se instalirati izvan checkouta:

```sh
npm install --prefix /workspace/.cache/opg-review-tools --no-save --no-audit --no-fund firebase-tools@14.27.0 @firebase/rules-unit-testing@3.0.4 firebase@10.14.1
node --test tests/*.test.cjs
```

Ako emulator već radi na 127.0.0.1:8088:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 NODE_PATH=/workspace/.cache/opg-review-tools/node_modules env -u GOOGLE_APPLICATION_CREDENTIALS node tests/pest-ai-rules.cjs
```

Za samostalno pokretanje cijelog lokalnog emulator ciklusa, dok port 8088 nije zauzet drugim testom:

```sh
FIREBASE_EMULATORS_PATH=/workspace/.cache/firebase/emulators XDG_CONFIG_HOME=/workspace/.cache/firebase/config NODE_PATH=/workspace/.cache/opg-review-tools/node_modules env -u GOOGLE_APPLICATION_CREDENTIALS /workspace/.cache/opg-review-tools/node_modules/.bin/firebase emulators:exec --only firestore --project demo-opg-ai --config firebase.ai-emulator.json 'node tests/pest-ai-rules.cjs'
```

Preglednički scenarij sam pokreće server na portu 8766, pa Chromium i WebKit izvršavati redom:

```sh
CHROMIUM_PATH=/usr/bin/chromium SAFE_AREA_TEST=1 XDG_CONFIG_HOME=/tmp/opg-xdg-config XDG_CACHE_HOME=/tmp/opg-xdg-cache node tests/fis-browser.cjs
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright WEBKIT_PATH=/workspace/.cache/run-opg-webkit.sh BROWSER_ENGINE=webkit SAFE_AREA_TEST=1 XDG_CONFIG_HOME=/tmp/opg-xdg-config XDG_CACHE_HOME=/tmp/opg-xdg-cache node tests/fis-browser.cjs
```

Druga naredba koristi lokalno pripremljen WebKit/ovjerene OS biblioteke u ovoj razvojnoj slici. Na drugom računalu instalirati službeni Playwright WebKit i OS preduvjete te izostaviti `WEBKIT_PATH`. Ne preskakati TLS, potpise ili provjeru integriteta artefakata. Fizički Safari ostaje zasebna provjera.
