# Zaštita: pregled tehničke nadogradnje

## Utvrđeno iz koda

`fisSyncDaily` čita `settings/fis_sync.enabled` i `zalihe[].fis_product_id`, a piše `fis_cache/{id}`, verzije u podkolekciji `versions` i `fis_sync_status/daily`. Uspješan završetak raspoređenog zadatka prethodno nije razlikovao prazne zalihe od nepovezanih zaliha. Isključeni posao nije zapisivao novi status; sučelje je nepostojeće brojače pretvaralo u nulu. To su mogući uzroci prikaza „provjereno 0”; konkretan produkcijski uzrok zahtijeva čitanje odgovarajućih Firestore dokumenata i logova.

Novi status razlikuje `disabled`, `no_stock`, `no_links`, `completed`, `partial`, `unavailable` i `failed`. `scanned` broji dokumente zalihe, `linked` povezane dokumente, `products` jedinstvene FIS ID-jeve, `attempted` pokušaje dohvata, `checked` uspješne dohvat/provjere i spremanja, `updated` osvježene zapise predmemorije (jednako `checked`), `changed` prethodno postojeće zapise kojima se promijenio sadržaj, a `failed` neuspjele dohvate. Prvo spremanje nije promjena prethodne verzije. Zadatak koji se prekine nema konačne brojače: prikazuju se kao nezabilježeni, uz odvojeni datum pokušaja. `errorsByKind` i logovi razlikuju HTTP, timeout, mrežu i neispravni JSON/payload, bez tijela odgovora i tajnih vrijednosti.

Prijedlozi su prethodno prikazivali i stare/neuspješno provjerene zapise; ručni dohvat nije sudjelovao u filtriranju. Sada se koristi najnoviji lokalni ili zajednički zapis. Samo uspješan dohvat mlađi od 24 sata, bez pogreške i s izričitim FIS statusom `REGISTRIRAN`, može dati uvjete u prijedlozima. Neprepoznati statusi ne daju odobrenje. Datum provjere i službeni izvor vidljivi su uz zapis. Stari uvjeti se ne prikazuju kao aktualni. Ne zaključuje se da općenita registracija za tikve vrijedi za butternut.

Pretraga prijedloga obuhvaća povezane proizvode u zalihama, **ne cijeli registar**; postoji poveznica na cijelu službenu tražilicu. Prazan rezultat ne dokazuje odsutnost registriranog sredstva. Doze se ne izračunavaju; prikazuje se samo izvorni dostupni tekst primjene, karence i ograničenja. Podudaranje naziva kulture/organizma ostaje tekstualni filter za ručnu provjeru, ne pravna potvrda primjenjivosti.

`Laser SC` nije pronađen kao tvrdo kodirana veza u repozitoriju. Povezivanje se sprema na stvarnoj zalihi. Pomoć pri pretrazi sada može ponuditi `LASER` ID `374`, ali samo ako se taj naziv i ID zajedno nalaze u dohvaćenom FIS katalogu. Nema automatskog povezivanja ni izmišljanja registracijskog broja. Korisnik provjerava točan proizvod/etiketu i izričito sprema vezu.

AI prikaz koristi postojeću strukturu odgovora i šest odjeljaka. Vidljivi simptomi odvojeni su od pretpostavki. Sažetak, alternative i dodatne fotografije imaju sklopive prikaze; prazna analiza ne dobiva izmišljeni uzrok. Prompt traži poredak mogućih uzroka, bez potvrde dijagnoze. Potvrda pregleda nasada ostaje preduvjet za prijenos uzroka u FIS filter. Limit od 100 pokušaja, idempotentnost, obračun troška, server-only ključ i autentikacija nisu promijenjeni.

Postojeći gornji safe-area i položaj gumba + već su bili definirani. Nedostajao je donji safe-area u završnom pravilu korijenskog sadržaja. Dodani su taj prostor i dodatni razmak Zaštite, prilagodljivi gumbi i kartice te dvostupčana podnavigacija na najužim zaslonima.

## Izvršene provjere

- Node 22; oba codebasea instalirana s `npm ci`, bez promjene manifesta ili lockfileova. npm cache je u `/workspace/.cache/npm` jer korisnički home nije zapisiv.
- `node --test tests/*.test.cjs`: 30 prolaznih testova, bez preskočenih.
- Playwright/Chromium: FIS povezivanje, promjene, neuspjeli dohvat, lokalna opažanja, zajednička predmemorija, neaktualni/ukinuti zapisi, AI suglasnost, šest odjeljaka, ponovljeni zahtjevi i kvota. Širine 320/360/390/430/1024 px; provjereni horizontalni overflow, razmak zadnje kartice, gumba + i navigacije.
- Učitavanje oba Firebase ulaza pod Nodeom 22 bez produkcijskog poziva; za ovu lokalnu provjeru izostavljena je neupotrebljiva injektirana ADC datoteka samo u procesu provjere. Nijedna tajna ni autentikacija nije izmijenjena.
- Stvarni FIS dohvat LASER 374 nakon primjene mrežne postavke: uspješan HTTP odgovor i validacija oba parsera; nije izveden produkcijski Firestore zapis.
- Lokalni statički server vraća aplikacijski HTML. Frontend nema build korak; izvršene su i JS sintaksne provjere te `git diff --check`.

## Ručna provjera prije produkcijske objave

1. U projektu `opg-ojka` pročitati `settings/fis_sync`, status i stvarne zalihe. Provjeriti da dokument zalihe Laser SC ima očekivani `fis_product_id: "374"` i naziv, nakon provjere etikete i službenog izvora. Ovaj rad nije pisao u produkcijsku bazu.
2. Nakon primjene mrežne postavke ponovljeni stvarni dohvat 27. 10. 2026. uspješno je potvrdio FIS ID 374: naziv `LASER`, status `REGISTRIRAN`, šest redaka primjena. Serverski i klijentski parser prihvaćaju stvarni odgovor. Izvor: https://fis.mps.hr/fis/javna-trazilica-szb/pregled/374 . To ne potvrđuje da je konkretna zaliha Laser SC ispravno povezana niti da je sredstvo dopušteno za svaku kulturu, štetnika ili način uzgoja. Prije primjene ponovno provjeriti aktualni izvor i etiketu.
3. Provjeriti sigurna pravila pristupa predmemoriji/statusu. Emulator pravila nije pokrenut; autentikacija i pravila nisu mijenjani.
4. Na fizičkom iPhoneu/Androidu u instaliranoj PWA provjeriti notch, početni indikator, povećani font, tipkovnicu i donju navigaciju. Automatizirana provjera rasporeda ne zamjenjuje tu provjeru.
5. Ovlašteno provjeriti AI na stvarnim fotografijama uz postojeći limit i obračun; ovaj rad nije pozivao plaćeni servis. Nema produkcijskog deploya ni automatskog spajanja.
