# Sigurnosni plan — aktualni kandidat PR #2

Konačan model i obavezni redoslijed hitnog zatvaranja, OWNER bootstrap-a, Functions/frontenda, restriktivnih pravila, MEMBER odobravanja i oporavka: **[ROLE-ROLLOUT.md](ROLE-ROLLOUT.md)**. On zamjenjuje raniji prijedlog pojedinačnih permission grantova. Nijedan produkcijski korak nije izvršen.

## Granice i privatnost

Korisnik je potvrdio široka objavljena pravila; iz ovog okruženja nema valjanog produkcijskog ADC pristupa za njihov izvoz, provjeru stvarnih UID-ova, IAM-a ili poslovnih dokumenata. Predložena konačna pravila su `backend/firestore-fis.rules.proposed` uz zasebni `firebase.security-review.json`. Hitni deny-all kandidat ima odvojeni `firebase.emergency-review.json`. Root `firebase.json` ostaje samo Functions konfiguracija; nijedna testna/setup naredba ne radi deploy.

Ugrađeni privatni početni poslovni zapisi uklonjeni su iz web artefakta i nema automatskih seed/import upisa. Stari lokalni podaci ostaju sačuvani. Privatna izvorna razvojna kopija ostaje izvan checkouta; ne uključivati je u web/Git artefakte ni dijeljenu sliku okruženja bez vlasnikove provjere. Povijesne Git kopije/ranije objavljeni artefakti zahtijevaju zasebnu odluku o privatnosti; ne radi se automatski rewrite/force-push. SW v28 osvježava samo app asset cacheove, ne briše Auth/localStorage/IndexedDB ni tuđe cacheove. Firebase pravila ne mogu opozvati već preuzete kopije na uređajima.

## Kompatibilnost

Zajedničke poslovne kolekcije zadržavaju strukturu i nepoznata postojeća polja. Ne zaključuje se vlasništvo iz `unio`/lokalnog imena. Stari `permissions`, `administrator` i AI `allowedUids` ne daju ovlasti; samo Google OWNER/MEMBER model s potvrđenom vezom vrijedi. OWNER i MEMBER imaju isti puni poslovni CRUD; sigurnosne/upravljačke promjene idu zasebnim provjerenim postupcima. Poslovne i javne runtime administratorske postavke razdvojene su; nema automatskog kopiranja starih endpointova. Detalji su u aktualnom rollout dokumentu.

## Laser SC / FIS ručna provjera

Javno provjereni FIS proizvod LASER 374 i njegova SC formulacija nisu dokaz stvarnog pakiranja/zališnog dokumenta. Ovlašteni korisnik nakon objave treba otvoriti postojeći Laser SC bez promjene količina/privitaka, provjeriti aktualni FIS izvor i datum, usporediti etiketu, registracijski broj i formulaciju pa izričito potvrditi vezu. Stari link bez dokaza ostaje neprovjeren. Promijenjen/nedostupan/stari izvor ne smije kvalificirati sredstvo. Pretraga kultura/organizama ne spaja neprovjerene sinonime; prazna pretraga nije dokaz da nema registriranog sredstva. AI opažanje nije potvrđena dijagnoza ni odobrenje tretiranja.

## Razvojne provjere

Node 22; backend zaključane ovisnosti kroz `npm ci --prefix backend/fis-sync` i `npm ci --prefix backend/pest-ai`. Statički frontend nema build korak. `node --test tests/*.test.cjs`, CSP hash provjere, frontend granica tajni i učitavanje Functions entry pointa ostaju obavezni.

Firestore alati izvan checkouta: firebase-tools 14.27.0, @firebase/rules-unit-testing 3.0.4 i firebase 10.14.1. Pokrenuti isključivo demo emulator, nikad produkciju:

```sh
firebase emulators:start --only firestore --project demo-opg-ai --config firebase.ai-emulator.json
# Drugi terminal: NODE_PATH prema vanjskim razvojnim alatima
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 node tests/pest-ai-rules.cjs
```

Suite briše samo izoliranu demo bazu i dodatno testira emergency pravila, prave transakcije ovlasti/kvote uz lažnog providera. Browser testovi su `tests/auth-browser.cjs` i `tests/fis-browser.cjs`, Chromium i WebKit odvojeno; FIS test ima `SAFE_AREA_TEST=1`. Nema plaćenih AI poziva. Auth emulator postupak i Google OAuth granice opisani su u [GOOGLE-AUTH.md](GOOGLE-AUTH.md).

Operatorske prijave, keyless ADC, stvarne permission provjere, privatni izvoz objavljenih pravila i AI stop kontrolni popis: [OPERATOR-PREFLIGHT.md](OPERATOR-PREFLIGHT.md). Potvrđena su dva ljudska IAM Ownera; postojeći IAM se ne mijenja.

Potvrđeni javni Cloud Run servisi, granice interne autorizacije, selektivna karantena/povrat i migracija bez brisanja legacy funkcija: [HTTP-ENDPOINT-CONTAINMENT.md](HTTP-ENDPOINT-CONTAINMENT.md).

Novo potvrđeno privatno podrijetlo legacy definicija i prioritetni fisPhotoLookup rizik: [HTTP-ENDPOINT-CONTAINMENT.md](HTTP-ENDPOINT-CONTAINMENT.md); pripremljeni guard i blokade privatne integracije: [FIS-PHOTO-AUTH-PATCH.md](FIS-PHOTO-AUTH-PATCH.md). Ranije navode da je legacy izvor nepronađen treba čitati kao povijesni nalaz, ne aktualni status.
