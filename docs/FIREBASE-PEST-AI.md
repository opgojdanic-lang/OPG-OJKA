> **Konačni model:** stari `allowedUids` više nije autoritet. Pristup zahtijeva Google OWNER/MEMBER i zaštićenu vezu; aktualni postupak je [ROLE-ROLLOUT.md](ROLE-ROLLOUT.md). Donje stare upute o dodavanju anonimnih UID-ova ne primjenjivati.

> Ažuriranje sigurnosnog kandidata: ovaj raniji opis treba čitati uz [SECURITY-RELEASE-PLAN.md](SECURITY-RELEASE-PLAN.md). Pravila sada zadano odbijaju pristup bez posebno potvrđenih dopuštenja; emulator testovi su izvršeni, a privatni početni podaci uklonjeni iz HTML-a. Ne objavljivati prethodnu široku varijantu pravila.

# Uključivanje AI analize fotografija

Ovo je pripremljen kod u draft PR-u. Funkcije nisu postavljene u produkciju ovim GitHub zapisom. Stvarna analiza i račun provjeravaju se tek nakon postavljanja API ključa. Nemoj slati API ključ u razgovor ili ga upisivati u HTML, Firebase web config ili Firestore.

## Što radi

`pestPhotoAnalyze` je Firebase callable funkcija, codebase `pest-ai`, Node.js 22, europe-west1. Koristi OpenAI Responses API, model `gpt-6.1-sol`, standardnu obradu i mali reasoning effort, uz najviše 2500 izlaznih tokena. Prima 1–3 JPEG fotografije do 700 px i kratko opažanje. Fotografije su ulaz za analizu, ne generiraju se nove slike.

Odgovor sadrži stvarno vidljive znakove, do tri moguća uzroka, nisku/umjerenu sigurnost i provjere u nasadu. Dopušten je odgovor bez identifikacije. Ne traže se pesticidi, doze, karence ni termini tretiranja. Rezultat se prikazuje kao pomoć pri pregledu, uz zasebnu korisnikovu radnju za FIS pretragu. Sama oznaka sigurnosti nije kalibrirana vjerojatnost. Prvih 20 analiza treba usporediti s pregledom nasada i, kada je potrebno, agronomom.

## Limit, trošak i ponovljeno slanje

- Najviše 100 rezerviranih pokušaja po kalendarskom mjesecu u Europe/Zagreb, zajednički za cijeli projekt, ne po uređaju. Status i nevaljan unos ne troše limit. Limit nije novčana garancija.
- Firestore transakcija rezervira mjesto prije poziva API-ja. Istodobni zahtjevi ne mogu prekoračiti limit. Jedan requestId za isti korisnički UID i isti sadržaj obrađuje se samo jednom. Uspješan ponovni poziv vraća spremljen rezultat.
- Neuspjeli i prekinuti API pozivi ostaju u limitu. Nema automatskih ponovnih poziva. Isti nedovršeni/neuspjeli zahtjev ne šalje se ponovno provideru; korisnik može izričito pokrenuti novi pokušaj koji ulazi u limit.
- U `ai_private/usage_YYYY-MM` spremaju se ukupni pokušaji, uspješni rezultati, odgovori s poznatim tokenima, procijenjen USD trošak i uzorak prvih 20 odgovora s poznatom potrošnjom. Odgovori bez dijagnoze i odbijeni/nepotpuni odgovori mogu imati naplatu i biti dio uzorka. Nepoznata potrošnja označena je zasebno.
- Procjena koristi stvarno vraćene input/output tokene, uključujući reasoning u output potrošnji. Referentne cijene provjerene 26. 10. 2026.: 2 USD / milijun ulaznih, 0,10 USD / milijun cached ulaznih i 10 USD / milijun izlaznih tokena. Cijene su zapisane uz obradu; nisu račun, ne uključuju Firebase, poreze, promjene tarifa ili nepoznatu potrošnju. Usporediti s OpenAI računom nakon prvih 20 obračunatih odgovora.

## Zaštita pristupa i podataka

Poziv zahtijeva verificirani Google Firebase token i aktualnu zaštićenu OWNER/MEMBER ulogu/vezu prema [ROLE-ROLLOUT.md](ROLE-ROLLOUT.md). Anonimni račun i stari allowedUids ne daju pristup. CORS nije autentikacija; App Check nije postavljen. Isti povezani Google račun zadržava UID na drugim uređajima u istom Firebase projektu.


`ai_private` je namijenjen samo Admin SDK-u. Fotografije i opis ne spremaju se u Firebase ni aplikacijske logove; spremaju se hash zahtjeva, tekst rezultata i mjerenja potrošnje radi ponovljenih poziva. Opažanja, fotografije i rezultat mogu se korisnikovim gumbom spremiti lokalno na uređaj. Provider prima odabrane fotografije i opis tek nakon potvrde slanja. `store:false` isključuje spremanje Responses aplikacijskog stanja, ali nije obećanje Zero Data Retention; primjenjuju se uvjeti obrade i zadržavanja podataka OpenAI računa. Backend zapisi rezultata nemaju automatsko brisanje u ovoj verziji; ne brisati zahtjeve/brojače tijekom mjeseca jer se time može izgubiti zaštita od ponovljenog slanja/prekoračenja limita.

## Koraci postavljanja

### 1. Prvo Firestore pravila

Sačuvati važeća pravila, usporediti ih s `backend/firestore-fis.rules.proposed` i objaviti odgovarajuću dopunu PRIJE stvaranja `ai_private/config` i uključivanja funkcija. Prijedlog čuva zatečeni široki pristup ostalim poslovnim kolekcijama; nije opća migracija ovlasti.

Nužno je dodati zabranu čitanja/pisanja za `ai_private/{document=**}` I izuzeti `ai_private` iz općeg pravila. Samostalno `allow write: if false` ne nadjačava staro dopuštajuće pravilo. U simulatoru/emulatoru provjeriti da ni prijavljeni korisnik ne može čitati/pisati config, mjesečnu kvotu ili zahtjeve. FIS cache mora ostati read-only, a postojeće zalihe i tretiranja dostupni kao prije.

### 2. OpenAI ključ

Ako već postoji valjana tajna `OPG_OPENAI_API_KEY` vezana uz funkciju, ponovno je koristiti; ovaj PR ne zahtijeva zamjenu ključa. Sljedeći koraci vrijede samo ako ključ nedostaje ili je zamjena zasebno odobrena.

U zasebnom OpenAI API projektu uključiti naplatu i napraviti projektni API ključ. Postaviti upozorenje potrošnje; upozorenje nije tvrda granica. ChatGPT Plus pretplata ne pokriva API pozive. U Cloud Shellu, u pregledanoj grani repozitorija:

```sh
npx firebase-tools functions:secrets:set OPG_OPENAI_API_KEY --project opg-ojka
```

Ključ zalijepiti isključivo u interaktivni skriveni upit za secret. Ne stavljati ga u naredbu, git ili snimku zaslona.

### 3. Postaviti samo novi codebase

Iz korijena pregledane kopije grane `fix/protection-fis-mobile-ai`:

```sh
node --test tests/fis.test.cjs tests/fis-sync.test.cjs tests/pest-ai.test.cjs
npm ci --prefix backend/pest-ai --ignore-scripts
npx firebase-tools deploy --only functions:pest-ai --project opg-ojka
```

Codebase sada obuhvaća `pestPhotoAnalyze`, `pestPhotoUsage`, `opgManageMember` i `opgSecurityControl`; slijediti aktualni rollout. Ne koristiti opći deploy ili potvrđivati brisanje ranije objavljenih funkcija. Dnevni FIS codebase i šest postojećih funkcija nisu zamjena za ovaj codebase.

### 4. Odobriti korisnike i uključiti AI

Slijediti isključivo [OWNER/MEMBER redoslijed](ROLE-ROLLOUT.md): zatvaranje širokih pravila, odobreni OWNER bootstrap, restriktivna pravila i OWNER-ovo odobravanje MEMBER-a. `ai_private/config.enabled` ostaje globalna kontrola; OWNER je mijenja kroz provjereni `opgSecurityControl`. Ne dodavati anonimne UID-ove ili koristiti stari allowedUids kao ovlasti. Kvota se ne resetira.

### 5. Jedna stvarna analiza i pregled nakon 20

Provjeriti dostupnost na dopuštenom uređaju; nedopušteni uređaj mora dobiti odbijen pristup. Dodati jasne fotografije bez osoba ili drugih nepotrebnih podataka, kulturu i opis. Potvrditi slanje i pritisnuti Analiziraj fotografije jednom. Provjeriti rezultat i povećanje pokušaja za jedan. Ponovno slanje neizmijenjenog zahtjeva u istom ekranu treba vratiti isti rezultat bez dodatne potrošnje. Status potrošnje dohvaća se bez API naplate analize.

Nakon prvih 20 obračunatih odgovora provjeriti prikazani prosjek naspram OpenAI računa, udio prepoznatih slučajeva naspram stvarnog pregleda i potrebu za boljim fotografijama/modelom. Ne postoji potvrđena točnost prepoznavanja prije takve provjere.

## Isključivanje

Postaviti `ai_private/config.enabled` na `false`: novi pozivi analize i statusa bit će odbijeni. Već poslani API poziv može završiti i imati trošak. Ključ se može zasebno opozvati na OpenAI računu ako je kompromitiran.

## Razvojne provjere

- `node --test tests/pest-ai.test.cjs`: autorizacija, transakcijske rezervacije, kvota 99/100, paralelni i ponovljeni zahtjevi, promjena mjeseca, neuspjeh/timeout, nepoznati trošak, odbijeni i nepotpuni odgovori, obračun tokena i uzorak od 20.
- `node tests/fis-browser.cjs` uz Playwright/Chromium: postojeći FIS, stvarna priprema fotografije u pregledniku, AI pozivi sa simuliranim callable odgovorima, potvrda slanja, tekstualni prikaz, spremanje lokalnog rezultata, FIS pretraga, kvota i odgovor bez identifikacije. Nema plaćenog provider poziva u testovima.
- `tests/pest-ai-rules.cjs` izvršava se samo uz lokalni Firestore emulator, `@firebase/rules-unit-testing` 3.x i Firebase web SDK 10.x, s projektom `demo-opg-ai`. Provjerava zabranu pristupa privatnim AI podacima, uključujući podkolekcije, uz očuvan zatečeni pristup zalihama. Dodatno provjerava stvarne Admin SDK transakcije: četiri istodobna zahtjeva pri 99/100 dopuštaju samo jedan API poziv. Konfiguracija emulatora: `firebase.ai-emulator.json` (nikada je ne koristiti za produkcijski deploy).

Službene reference: [OpenAI model](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [strukturirani odgovori](https://developers.openai.com/api/docs/guides/structured-outputs), [slike](https://developers.openai.com/api/docs/guides/images-vision), [Firebase callable](https://firebase.google.com/docs/functions/callable), [Firebase secrets](https://firebase.google.com/docs/functions/config-env).
