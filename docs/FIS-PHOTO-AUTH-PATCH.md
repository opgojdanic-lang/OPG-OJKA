# fisPhotoLookup — pripremljeni autorizacijski sloj, ne zamjenski backend

Aktualni nalazi i rizik: [HTTP-ENDPOINT-CONTAINMENT.md](HTTP-ENDPOINT-CONTAINMENT.md), privatni ZIP generation **1791805687868314**, handler od r.29, Bearer r.177–178 pripada ingestWeather. `fisphotolookup` ima potvrđen allUsers, ALL ingress, 100% `fisphotolookup-00009-jac` i runtime SA roles/editor. To je visok rizik, bez dokaza aktivnog iskorištavanja. Nalaze je potvrdio vlasnik; agent nije dobio/otvorio privatni ZIP i ne tvrdi da je proveo njegov cjelovit pregled.

## Što je pripremljeno u javnom PR-u

`backend/pest-ai/http-role-gate.js` je **samostalna javna autorizacijska komponenta**, koristi postojeći `roles.js`. Nije novi `fisPhotoLookup`, ne eksportira Cloud Function, nije spojen na postojeće `pest-ai` exporte i ne mijenja `firebase.json`. Deploy tog codebasea sam po sebi neće popraviti privatni legacy handler. Nema kopije privatnog index.js, originalnog AI/FIS koda, ključeva ili credential datoteka.

Factory `createHttpRoleGate({auth,db})` prima postojeće Firebase Admin Auth/Firestore instance; ne stvara novu aplikaciju, vjerodajnice, korisnike ili role. Povratni async gate prima Express request/response i vraća true samo ako postoje:

1. Jedan valjan Bearer header, bez čitanja tokena iz body/query/cookieja.
2. Admin `verifyIdToken(token, true)` — provjera potpisa/isteka/projekta preko SDK-a i opoziva/onemogućenog korisnika. Dodatno su fiksni aud/iss `opg-ojka` i jednak uid/sub.
3. Verificirana Google prijava i aktualna zaštićena OWNER/MEMBER uloga + singleton veza za isti UID, preko kanonskog `requireRole`.

Nedostajuća/nevaljana/opozvana prijava daje 401, nedopuštena uloga 403, nemogućnost provjere Auth/Firestore/IAM daje 503 uz zatvoren pristup. Odgovori su generički `{error:tekst}`, bez credential/error dumpa i s `Cache-Control:no-store`. Nema pisanja u bazu ni poziva providera. OPTIONS za točno odobreni GitHub origin vraća 204 bez Auth/DB/poslovnog handlera; Authorization i Content-Type su eksplicitno dopušteni u CORS-u. Neodobren origin odbija se, ali origin/CORS nisu zamjena za token i ulogu. Poziv bez Origin headera i dalje mora proći token/role provjeru. Gate ne rekonstruira body, MIME, FIS upite, provider, kvotu ili response poslovnog handlera.

**Preduvjet:** role registry/control moraju biti zaštićeni restriktivnim pravilima prije javnog povrata. Dok stara pravila dopuštaju klijentsku samododjelu uloge/veze, čak ni JWT + requireRole nije potpuna zaštita. Google prijava sama ne odobrava korisnika. Treba privatno pregledati i ostale Admin/IAM putove iz zajedničkog paketa: ne smiju omogućiti neodobren upis access_members/access_control mimo OWNER postupka, jer Firestore pravila ne ograničavaju Admin SDK.

`fis-photo-client.js` dodaje Bearer iz postojećeg Firebase korisnika, bez vlastitog spremanja/logiranja tokena i bez anonimnog fallbacka. `index.html` i dalje lokalno priprema isti JPEG i šalje isti JSON **`{image,mimeType}`**, a stari `{parsed:...}` ugovor, odabir reda i popunjavanje kalkulatora ostaju. Zahtjev je jedan POST, bez automatskog retryja nakon 401/403/mrežne pogreške i bez praćenja redirecta. Promjena UID-a/sessiona sprječava slanje/primjenu zastarjelog rezultata. Tekst kandidata iz untrusted AI odgovora dodatno je HTML-kodiran.

**Sprječavanje token exfiltracije:** klijent ne šalje Firebase bearer na proizvoljni URL iz settings/localStorage. Trenutačno je dopušten samo fiksni `https://europe-west1-opg-ojka.cloudfunctions.net/fisPhotoLookup` (i isti put sa završnim slashom). Vlasnik prije objave mora potvrditi stvarni canonical URL iz Functions metadata. Ako sadašnja konfiguracija koristi `run.app`, to nije dokaz kompatibilnosti: puni javni URL i projekt/revizija trebaju se neovisno potvrditi prije dodavanja točnog URL-a u pregledani source allowlist ili odobrene promjene na canonical URL. Nema wildcard `*.run.app`, automatskog mapiranja po prefiksu imena ili dinamičkog proširenja allowlista iz baze. Odbijanje neprovjerene adrese namjerna je zaštita; to je otvorena kompatibilnosna blokada ako postojeći uređaji koriste takav alias. Ne mijenjamo stvarne settings zapise.

SW v29 osvježava samo app assete; nema brisanja Auth/localStorage/IndexedDB ili poslovnih podataka. Stari frontend bez Bearer tokena mora nakon stvarne backend integracije dobiti 401, ne insecure fallback. Korisnik može nastaviti ručni unos i provjerljivu FIS pretragu; to nije odobrenje doza/registracija iz AI/OCR rezultata.

## Privatna integracija — nije izvršena

Vlasnik u privatnom checkoutu mora prvo:

- izračunati/privatno sačuvati hash ZIP-a i povezati Storage generation, Cloud Functions entry point/build source, image digest i aktivnu reviziju; ne objavljivati ZIP/source/secrets u PR;
- pregledati puni handler i inicijalizaciju/modulske nuspojave, sve pozive providera/Firestore, postojeći CORS i error shape, dependency/lockfile verzije te limite/dedupe. Potvrditi da obje kopirane javne komponente koriste kompatibilan Admin SDK i da runtime ima postojeće pravo Auth getUser potrebno za checkRevoked; nedostajuća provjera mora fail-closed, ne fallback;
- potvrditi exporte i stvarnu produkcijsku prisutnost svih šest definicija iz zajedničkog paketa. Za ingestWeather zadržati i pregledati njegov zasebni Bearer ugovor; ne pretvoriti ga slučajno u interaktivni Google OWNER tok. Za checkSprayConditions/planReminders prvo utvrditi tip okidača i caller;
- kopirati **samo nove javne** `http-role-gate.js` i kanonski `roles.js` u privatni source kao susjedne module, bez vraćanja privatnog koda u ovaj repo; prvo provjeriti kolizije naziva i ne prepisivati postojeće privatne module. Za koliziju odabrati zaseban naziv, pregledati samo izmjenu import putanje i ponovno testirati;
- u postojeći fisPhotoLookup handler dodati `await gate(req,res)` prije prve poslovne nuspojave. Zadržati postojeću onRequest/v1/v2 registraciju, naziv, opcije, secret reference i ostalu logiku. Ne kreirati novu registraciju prema pretpostavljenom SDK-u. CORS OPTIONS mora završiti bez poslovnog handlera, a sve ne-OPTIONS rute moraju proći gate. Ukloniti/doraditi konfliktni CORS samo uz privatni pregled. Guard ne smije završiti tek nakon Firestore/provider poziva.

Shematski fragment, **nije potpuni backend ni deploy recept**:

```js
const {createHttpRoleGate} = require('./http-role-gate');
const gate = createHttpRoleGate({auth: EXISTING_ADMIN_AUTH, db: EXISTING_FIRESTORE});
// Inside the EXISTING fisPhotoLookup handler, before business reads/writes/provider:
if (!await gate(req, res)) return;
// Continue the exact private business implementation. Do not reconstruct it here.
```

Čuvanje poslovne logike dokazuje se testovima privatnog handlera s lažnim Firestore/providerom: isti dozvoljeni JPEG input → isti FIS request/query i parsed odgovor kao prije, ali bez bilo kakve poslovne operacije za odbijene identitete. Javni test sa sintetičkim handlerom nije zamjena za taj dokaz. Guard ne uvodi nepoznatu staru kvotu niti potvrđuje da je fisPhotoLookup obuhvaćen postojećim pest limitom 100; prije povrata mora se potvrditi stvarna kontrola troška.

## Odobreni budući containment / rollback / povrat

**Sada nema produkcijskih promjena.** `fisphotolookup` je prioritetan za zasebno odobrenu transportnu K karantenu iz HTTP runbooka. Privatno sačuvati baseline IAM/ingress/reviziju/tagove/rute/trigger/retry stanje i rezervni ljudski IAM Owner put; potvrditi invoker IAM-check, ne samo allUsers. Zaustaviti stvarne automatizirane pozive prema inventaru. Uklanjanje allUsers samo po sebi ne blokira preostale IAM callere, interni promet, alternativne/tagged URL-ove ili već primljenu obradu. Nema aktivnog HTTP testa na produkcijskom handleru tijekom ovog pregleda.

Nakon odobrenja: koordinirano zatvoriti HTTP put i stare široke Firestore upise, isključiti samo **dokazano podržane** kontrole bez resetiranja kvote; privatno integrirati i staging-testirati guard, potvrditi OWNER/MEMBER registry, deployati samo stvarni postojeći fisPhotoLookup Functions ID iz njegovog potvrđenog codebasea. Ne koristiti javni pest-ai codebase kao zamjenu i ne deployati svih šest exporta općom naredbom. Ako CLI predloži brisanje/neočekivanu zamjenu, stati. Nakon svake ciljane objave ponoviti IAM/ingress/traffic/revizija/tag provjere jer deploy može promijeniti transportnu politiku. Prije javnog povrata potvrditi da stara nezaštićena revizija 00009-jac nije dosegljiva preko taga ili alternativne rute; sačuvati artefakt za privatni oporavak, ne javni bypass. Tek potom objaviti kompatibilni frontend, provesti negativne testove i zasebno odobriti minimalni povrat browser transporta. Uskladiti redoslijed s auth-only/OWNER/bootstrap fazama iz ROLE-ROLLOUT; role se ne dodjeljuju ovim patchom.

**Rollback:** ako guard ili frontend ne prođe provjere, zadržati karantenu i ručni unos. Ne vraćati javni pristup reviziji `fisphotolookup-00009-jac` bez gatea, ne dodavati anonymous fallback i ne otvarati Firestore. Prethodni frontend može biti privremeni UI fallback samo uz zatvoren backend (foto obrada neće raditi), bez brisanja korisničkih podataka. Povrat prethodnog privatnog artefakta moguć je samo uz zasebno odobrenje i zadržanu transportnu blokadu; nije siguran javni rollback. Dva postojeća IAM Ownera ostaju operatorski put, njihova prava se ne mijenjaju. Runtime Editor treba zasebno razmotriti prema stvarnim ovisnostima i pripremiti least-privilege diff; ne uklanjati ga naslijepo dok ne postoje testirane potrebne ovlasti i povratni plan.

## Negativni i kompatibilnosni testovi

| Scenarij | Očekivanje prije poslovnog handlera |
|---|---|
| Bez Bearer / malformed / duplikat headera | 401, bez DB/provider obrade |
| Nevaljan, istekao, opozvan ili disabled-user token | 401, bez provider poziva; checkRevoked=true |
| Drugi Firebase projekt ili nejednak uid/sub | 401, bez čitanja role |
| Anoniman, Google UNAPPROVED, disabled/orphaned role | 403, bez privatnog handlera |
| Auth/Firestore/IAM nedostupan | 503 i zatvoren pristup, bez fallbacka |
| Body/query s tuđim uid/role | nema utjecaja na gate; samo verificirani token je identitet |
| Točan OPTIONS | 204/CORS, bez token/DB/handler operacije |
| OWNER i MEMBER | isti originalni request/parsed ugovor; gate ne mijenja poslovni payload |
| Frontend 401/403 ili promjena korisnika | nema automatskog retryja, slanja drugom korisniku ili primjene starog rezultata |
| Neprovjeren URL/redirect | token/fotografija se ne šalju tom hostu; nema praćenja redirecta |

Lokalni testovi mockaju verifier i poslovni handler; ne dokazuju kriptografsku ispravnost produkcijskog tokena, privatni kod, CORS postavku wrappera ili live stanje IAM-a. Prije produkcije u privatnom stagingu ponoviti s pravim Firebase Auth emulatorom/odobrenim računima i lažnim providerom, zatim posebno odobreni kontrolirani negativni test na potvrđenoj novoj reviziji. Ne slati fotografije ili stvarati trošak staroj neprovjerenoj reviziji kao probu.

Izvršene lokalne provjere: **80/80 Node testova**. Chromium i WebKit s lažnim Firebase/HTTP adapterima prolaze Bearer POST, postojeći parsed/odabir/popunjavanje ugovor, escape kandidata, 401 poruku bez retryja i očuvanje ostalih modula/pohrane. To ne potvrđuje privatni handler niti stvarnu Google/CORS/produkcijsku integraciju.
