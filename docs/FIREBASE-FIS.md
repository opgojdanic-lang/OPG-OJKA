> Aktualne sigurnosne uvjete, potvrdu FIS identiteta i redoslijed objave određuje [SECURITY-RELEASE-PLAN.md](SECURITY-RELEASE-PLAN.md). Ovaj raniji opis nije odobrenje aktivacije ni širokog pristupa.

# Zalihe / FIS — prva nadogradnja

## Što je spremno

- Nova kartica Zaštita → Zalihe / FIS.
- Korisnik potvrđuje točan proizvod i registracijski broj. Nema automatskog povezivanja sličnih naziva.
- Na postojeći dokument `zalihe/{id}` dodaju se samo `fis_product_id` i `fis_product_name`, putem `updateDoc`. Količine i privici se ne prepisuju.
- FIS podaci se provjeravaju ručno. Predmemorija posljednjeg uspješnog dohvata i prethodne verzije je lokalna ovom uređaju.
- Neuspješan dohvat ne osvježava vrijeme uspješne provjere. Podaci stariji od 24 sata označeni su kao nepotvrđeno aktualni.
- Ne izračunava se doza, ne potvrđuje se dopuštenost primjene i ne mijenjaju se karence.

## Firebase — što sada pregledati

1. Otvoriti postojeći projekt u Firebase konzoli. Ne stvarati novu bazu.
2. Firestore Database → Rules: kopirati postojeća pravila radi pregleda. Ne mijenjati ih naslijepo i ne otvarati bazu pravilom `if true`.
3. Project settings → General: zabilježiti Project ID (nije privatni ključ).
4. Provjeriti plan projekta: Spark ili Blaze. Ne uključivati naplatu prije dogovora o pozadinskom servisu.
5. Provjeriti postoje li Cloud Functions i već postavljena autentikacija. Aplikacija trenutačno pokušava anonimnu prijavu; anonimna prijava sama po sebi ne ograničava pristup na članove obitelji.

Za ovu prvu verziju nisu potrebne nove kolekcije ako postojeća pravila dopuštaju ovlaštenom korisniku dodavanje navedenih polja dokumentu zalihe. Ako se koristi popis dopuštenih polja, treba ga ciljano dopuniti nakon pregleda pravila.

## Sljedeći korak: provjere dok je aplikacija zatvorena

Tek nakon pregleda projekta dodati zakazanu funkciju, zajedničku predmemoriju FIS podataka i povijest promjena. Serverska funkcija piše podatke; klijenti ih samo čitaju prema odobrenim pravilima. Zakazivanje i procjena troškova moraju biti dogovoreni prije objave.

FIS adapter koristi javni servis službene tražilice, bez prijave. To nije potvrđen ugovoreni API: moguća je promjena adresa ili sheme. Potrebno je pratiti greške i provjeriti uvjete dugoročnog automatiziranog korištenja. Službena uputa ostaje izvor za konkretnu primjenu.

## Provjera prije puštanja u rad

Na odvojenoj probnoj kopiji koristiti ogledne zalihe bez produkcijskih Firebase postavki. Provjeriti povezivanje, prikaz uvjeta, neuspješan dohvat i rad bez mreže. Nova verzija ne uvodi automatsko pisanje u bazu; povezivanje je izričita korisnička radnja.
