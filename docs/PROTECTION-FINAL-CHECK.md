> Ažuriranje sigurnosnog kandidata: ovaj raniji opis treba čitati uz [SECURITY-RELEASE-PLAN.md](SECURITY-RELEASE-PLAN.md). Pravila sada zadano odbijaju pristup bez posebno potvrđenih dopuštenja; emulator testovi su izvršeni, a privatni početni podaci uklonjeni iz HTML-a. Ne objavljivati prethodnu široku varijantu pravila.

# Završna provjera PR-a #2

Provjera 27. 10. 2026. Ne odobrava produkcijski deploy. PR ostaje draft; nije spojen.

## Odluka

Ne preporučuje se bezuvjetno spajanje i neposredno puštanje u produkciju dok se ne potvrde važeća Firestore pravila i stvarno povezivanje zalihe te ne napravi završna provjera fizičkog iPhonea. Dokazani problemi u kodu ispravljeni su u istoj grani. Lokalne provjere ne dokazuju stanje objavljenih funkcija ili produkcijske baze.

## Ispravljeno u završnom pregledu

- Otvoreni FIS detalj ponovno provjerava aktualnost pri povratku aplikacije iz pozadine, proteku vremena i novim podacima. Neaktualan/neuspješan zapis nema oznaku aktualnog statusa niti uvjete primjene. Neizmijenjene provjere ne zatvaraju već otvorene uvjete.
- Za aktualan prikaz potrebni su valjan ID, naziv, registracijski broj, izričit status `REGISTRIRAN`, uspješna provjera mlađa od 24 sata i izostanak pogreške. Promjena povezivanja zatvara uvjete prethodnog proizvoda. Nepotpuni/neispravni zapisi ostaju neprovjereni.
- Backend i frontend odbijaju neispravne ugniježđene primjene/organizme. Neispravni ID-jevi kataloga ne mogu se spremiti kao poveznica. Oštećena prethodna verzija ne poništava zasebno valjan aktualni odgovor; povijest se označava nečitljivom.
- Jedan neispravan stari ID zalihe ne zaustavlja ispravne ID-jeve. `invalidLinks` broji dokumente s neispravnim upisanim ID-jem, odvojeno od neuspjelih mrežnih pokušaja. `linked` broji sve neprazne upisane ID-jeve; `products` i `attempted` odnose se samo na valjane jedinstvene ID-jeve. Ograničenja 200 zaliha/40 proizvoda ostaju.
- Paprika babura pretražuje izričiti naziv babura i općeniti naziv paprika, uz vidljivo upozorenje da je potrebna provjera vrste i uvjeta. Ukrasna i ljuta paprika nisu automatsko podudaranje. Tikvica se ne izjednačava s tikvom; butternut traži izričit naziv butternut. Općenita tikva, muškatna tikva i taksonomski/neprovjereni sinonimi nisu automatska potvrda.
- Organizmi se traže kao cijeli nazivi/riječi ili prema izričitom latinskom nazivu iz FIS-a. Nema nejasnog podudaranja dijela riječi niti izmišljanja sinonima. Stariji lokalni cache bez latinskih naziva može zahtijevati novi dohvat. Negativan rezultat nije dokaz da ne postoji registrirano sredstvo.
- Indikator povlačenja za osvježavanje poštuje gornji safe-area, potpuno je skriven kad nije aktivan i poništava se na `touchcancel`. FIS unos ima veličinu fonta 16 px radi izbjegavanja automatskog povećanja Safari obrasca. Toast obavijest također koristi donji safe-area kako ne bi prekrivala navigaciju. Donji razmaci i položaji navigacije/gumba + provjereni su automatizirano.
- Emulator test odbija pokretanje bez eksplicitnog lokalnog `FIRESTORE_EMULATOR_HOST`; nema slučajnog usmjeravanja na produkciju.

## Dokazi i granice provjere

- Node 22: 35 prolaznih testova, uključujući granicu frontend/server tajne, kvarove FIS-a, stare/neispravne zapise, preciznost naziva, kvotu 100 i idempotentnost AI-ja.
- Chromium i WebKit s iPhone 13 emulacijom: prolazi FIS/AI preglednički scenarij. Provjerene širine 320/360/390/430 px i 1024 px, horizontalni overflow, razmaci zadnje kartice/gumba +/navigacije, starenje otvorenih uvjeta i simulirani inseti 47 px gore/34 px dolje. Simulirani inseti nisu mjerenje stvarnog iOS sučelja.
- Stvarni FIS GET za LASER 374: HTTP 200, naziv LASER, status REGISTRIRAN, šest redaka primjena; oba parsera prihvaćaju odgovor. Među tim redcima paprika je izričito označena **u zaštićenom prostoru**. Ti redci ne daju podudaranje za tikvicu/butternut. Ovo nije popis svih mogućih registracija ili malih namjena.
- CORS provjera uz Origin `https://opgojdanic-lang.github.io`: GET dopušta `*`; OPTIONS za POST pretragu vraća 204 i dopušta POST/Content-Type. To je provjera HTTP zaglavlja, ne dokaz svih uvjeta produkcijskog preglednika.
- Nijedan korijenski frontend HTML/JS/CSS nema naziv serverske tajne, literal OpenAI ključa ili izravan OpenAI API URL. `backend/pest-ai/index.js` koristi `defineSecret('OPG_OPENAI_API_KEY')` samo na serveru, uz postojeću autentikaciju/popise UID-ova. Firebase web `apiKey` nije OpenAI ključ. Tajne nisu mijenjane niti ispisivane.
- Produkcijski ADC vraća `app/invalid-credential`. Nije potvrđeno povezivanje zalihe ni važeća Firestore pravila; nije bilo produkcijskog pisanja.
- Predložena pravila pregledana su: FIS cache/status su read-only za prijavljenog korisnika; `ai_private` zabranjuje klijentsko čitanje/pisanje i izuzet je iz općeg wildcarda. Pravila nisu objavljena. Ostale poslovne kolekcije i dalje dopuštaju pristup svakom prijavljenom korisniku, uključujući anonimnog: to nije provjera obiteljskog članstva i zahtijeva zaseban pregled ovlasti. Ne dodavati samo `allow ...: if false` preko postojećeg dopuštajućeg wildcarda.
- Emulator suite NIJE izvršen: službeni Firestore JAR s `storage.googleapis.com` vraća proxy HTTP 403. Test postoji i proširen je za zabranu čitanja neprijavljenih korisnika i klijentskog brisanja FIS podataka. Potrebno ga je izvršiti u okruženju s dopuštenim preuzimanjem; to nije prolazna provjera produkcijskih pravila.
- Frontend nema build korak. JS sintaksne provjere i `git diff --check` prolaze. Manifesti, lockfileovi, autentikacija i produkcijski podaci nisu mijenjani.

## Precizna ručna provjera Laser SC → LASER 374

1. Otvoriti postojeći Firebase projekt **opg-ojka** i odgovarajuću postojeću Firestore bazu. Ne stvarati prazni zamjenski projekt. Potvrditi da aplikacija pokazuje zajedničku sinkronizaciju; lokalno spremljena zaliha nije dokaz zajedničkog povezivanja.
2. U `zalihe` pronaći dokument čiji je `naziv` „Laser SC”. Zabilježiti ID dokumenta i postojeće količine/priloge. Ako postoji više takvih dokumenata, svaki provjeriti zasebno; ne spajati i ne brisati ih.
3. Usporediti etiketu konkretnog sredstva, naziv, vlasnika/registracijski broj s aktualnim službenim zapisom https://fis.mps.hr/fis/javna-trazilica-szb/pregled/374 . Naziv „Laser SC” sam nije dokaz istog proizvoda.
4. Nakon potvrde identiteta provjeriti polja `fis_product_id: "374"` i `fis_product_name: "LASER"`. Postojeći broj `374` čitatelji prihvaćaju; nova veza sprema se kao string. Ako veza nedostaje, koristiti Zaštita → Zalihe / FIS → Pronađi/Promijeni povezivanje i izričito odabrati katalogom potvrđeni LASER. Ne prepisivati cijeli dokument niti količine/priloge. Provjeriti isto povezivanje na drugom ovlaštenom uređaju.
5. Pritisnuti ručnu provjeru i provjeriti naziv, registracijski broj, datum i izvor. Ručni dohvat ostaje lokalni i sam ne povećava dnevni serverski brojač.
6. Nakon odobrene objave funkcije provjeriti `settings/fis_sync.enabled` kao boolean `true`. Ovlašteno pokrenuti samo Scheduler posao `fisSyncDaily` jednom. U `fis_sync_status/daily` provjeriti smislen `outcome`, `scanned`, `attempted`, `checked`, `updated`, `failed`, `invalidLinks` i vrijeme. `changed: 0` uz uspješnu nepromijenjenu provjeru je očekivano.
7. U `fis_cache/374` provjeriti `productId`, `checkedAt`, `lastAttemptAt`, `error`, `errorCode`, izvor i sadržaj `rawJson.basicInfo` nakon parsiranja. Provjera mora biti aktualna, pogreška prazna i status iz izvora registriran. Ne mijenjati `checkedAt` ručno radi uklanjanja upozorenja.
8. Potvrditi da neuspješan/zastario/ukinuti zapis nema uvjete kao aktualno registrirano sredstvo. Na produkciji ne izazivati kvar brisanjem ili lažiranjem podataka; scenarije kvara provjeriti testnom kopijom i postojećim testovima.

## Što kasnije objaviti — nije izvršeno ovim pregledom

- Selektivno codebase **fis-sync** (`fisSyncDaily`) i **pest-ai** (`pestPhotoAnalyze`, `pestPhotoUsage`). AI prompt je izmijenjen u ovom PR-u; logika `pestPhotoUsage` nije mijenjana, ali ulazi u ciljani codebase. Ne objavljivati/brisati ostale postojeće funkcije. Zadržati postojeći secret i autentikaciju.
- Predložena pravila prvo usporediti s važećim pravilima, testirati i zasebno odobriti potrebnu dopunu. Korijenski `firebase.json` ne uključuje Firestore deploy, pa functions deploy ne objavljuje pravila.
- **Firebase Hosting nije potreban.** GitHub Pages API potvrđuje `https://opgojdanic-lang.github.io/OPG-OJKA/`, izvor `main`, direktorij `/`, legacy build. Frontend HTML/JS/CSS mora biti objavljen tim postojećim putem. Spajanje na main može pokrenuti Pages objavu; to ovim pregledom nije učinjeno. Ne dodavati Hosting bez provjere domene i callable CORS postavki.

## Nakon odobrene objave

- Potvrditi točne verzije tri funkcije, logove i dnevni status; razlikovati ručni od dnevnog dohvata.
- Dovršiti Laser SC korake gore te provjeriti kulturu, organizam, zaštićeni/otvoreni uzgoj i svaku izvornu uputu. Rezultati nisu automatska preporuka tretiranja.
- S dopuštenim UID-om provjeriti dostupnost AI-ja, jednu analizu, porast kvote za jedan i ponavljanje bez novog provider poziva; nedopušten UID mora biti odbijen. Ne trošiti cijelu produkcijsku kvotu radi testa.
- Pravilima potvrditi zabranu klijentskog čitanja/pisanja `ai_private`, pisanja/brisanja `fis_cache` i `fis_sync_status`, uz očuvane ovlaštene zalihe i tretiranja.
- Na fizičkom iPhoneu otvoriti Safari i instaliranu PWA: portrait/landscape, otvorena/zatvorena adresna traka, tipkovnica, povećani tekst, povlačenje i prekid dodira, povratak iz pozadine nakon isteka FIS aktualnosti. Posljednji sadržaj mora se moći pomaknuti iznad gumba + i navigacije; ništa ne smije biti pod notchom/home indikatorom.
- Provjeriti novu Pages verziju i offline cache na dva uređaja te postojeće zalihe, tretiranja, kalkulator i druge kartice bez gubitka podataka.
