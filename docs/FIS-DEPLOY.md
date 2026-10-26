# Postavljanje dnevne FIS provjere — opg-ojka

## Pripremljeno, nije objavljeno

`firebase.json` obuhvaća samo novi codebase `fis-sync` i jednu novu funkciju `fisSyncDaily` na Node.js 22. Dostavljena arhiva starih funkcija pregledana je lokalno i nije dio ovog GitHub prijedloga. Nije potvrđeno da svaka od šest postojećih funkcija koristi istu verziju arhive.

Nova funkcija radi u 06:00 po Europe/Zagreb, s najviše jednom instancom i bez automatskog ponavljanja nakon pogreške. Čita najviše 200 zaliha i provjerava najviše 40 različitih FIS ID-ova. Duplikati se dohvaćaju jednom. Ne ovisi o tome je li aplikacija otvorena.

Funkcija je neaktivna dok `settings/fis_sync.enabled` nije boolean `true`. Kontrola je samo operativni prekidač, a ne autorizacija; zatečena pravila pristupa poslovnim podacima i dalje su široka. Predlaže se zasebna migracija na provjerene članove obitelji.

## Prije postavljanja

1. Pregledati draft PR, dovršiti pregledničku provjeru (uključujući stvarni FIS CORS preflight) i dogovoriti objavu. Ne spajati PR automatski.
2. Sačuvati postojeća Firestore pravila. Prijedlog `backend/firestore-fis.rules.proposed` zadržava postojeći pristup poslovnim podacima, ali izuzima `fis_cache` i `fis_sync_status` iz klijentskog pisanja. To je prijelazno pravilo, ne potpuna zaštita članstva.
3. Testirati pravila u simulatoru/emulatoru: anonimni prijavljeni korisnik smije pročitati FIS cache, ne smije ga pisati niti pisati njegovu podkolekciju versions; dopuštene postojeće kolekcije i dalje rade. Dodavanje `allow write: if false` uz stari opći wildcard NE štiti kolekciju — mora se zamijeniti i wildcard kako je u prijedlogu.
4. Potvrditi troškove i prava za Cloud Functions, Cloud Scheduler, Cloud Build i Artifact Registry. Blaze je već uključen, ali ne znači da je svaka potrošnja besplatna.

## Cloud Shell — bez instaliranja na službeni Windows

Otvoriti Cloud Shell u Google Cloud konzoli i potvrditi da je aktivan projekt `opg-ojka`. Provjera računa i projekta je samo čitanje:

```sh
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud config get-value project
```

Nakon dogovora o postavljanju, iz svježe mape preuzeti pregledanu granu:

```sh
git clone --branch feature/fis-stock-review https://github.com/opgojdanic-lang/OPG-OJKA.git opg-fis-review
cd opg-fis-review
node --test tests/fis.test.cjs tests/fis-sync.test.cjs
npm ci --prefix backend/fis-sync --ignore-scripts
```

Postaviti ISKLJUČIVO novi codebase, iz korijena projekta:

```sh
npx firebase-tools deploy --only functions:fis-sync --project opg-ojka
```

Ako alat zatraži brisanje ili promjenu neke od postojećih šest funkcija, prekinuti i provjeriti konfiguraciju. Ne koristiti opću naredbu `firebase deploy`, ne deployati arhiviranu mapu i ne brisati funkcije. Ako je potrebna dodatna prijava, slijediti standardni Firebase CLI tijek u Cloud Shellu; ne slati tokene ili lozinke u razgovor.

## Uključivanje nakon uspješnog postavljanja i pravila

1. U Firestoreu napraviti dokument `settings/fis_sync` s poljem `enabled` tipa boolean `true`. Ne mijenjati `settings/app`.
2. Povezati oglednu zalihu s točnim FIS ID-om u pregledanoj verziji aplikacije. Ne pokretati staru aplikaciju na praznom testnom Firebase projektu bez pregleda seed logike.
3. U Cloud Scheduleru pronaći posao za `fisSyncDaily` i ručno ga pokrenuti jednom. Otvara se raspored funkcije; ne pozivati druge HTTP funkcije koje mogu poslati obavijesti.
4. Provjeriti `fis_sync_status/daily` i `fis_cache/{id}`: `checkedAt`, `lastAttemptAt`, `error`, `rawJson` i `fingerprint`. Ako nema povezanih zaliha, rezultat s nula provjera je očekivan.
5. Prije produkcijske uporabe dovršiti klijentsko povezivanje na fis_cache i test na dva uređaja. Početni PR prikazuje lokalni ručni dohvat; on se ne upisuje kao serverski autoritativan zapis.

Neuspješan dohvat sprema grešku, a vrijeme posljednjeg uspješnog dohvata ostaje isto. Nepotpuni odgovori nisu valjani. Prethodna verzija i sadržajno različite verzije čuvaju se u `fis_cache/{id}/versions/{hash}`; dugoročno planirati retenciju. Prva verzija ne šalje push za promjene i ne ažurira povijesna tretiranja.

## Zaustavljanje

Postaviti `settings/fis_sync.enabled` na boolean `false`. Time sljedeće izvršavanje preskače provjere; posao i dalje postoji i može imati trošak zakazivanja. Za potpuno zaustavljanje pauzirati samo novi Cloud Scheduler posao.

## Ograničenja

Javni FIS servis nema potvrđen ugovor stabilnosti za vanjsku integraciju. Dohvat ne jamči potpunost izvornog unosa ili dopuštenost primjene. Upute i dodatni uvjeti ostaju obvezni za odluku. Prije produkcije dovršiti browser i Firebase emulator provjere, koje u ovom okruženju još nisu provedene.
