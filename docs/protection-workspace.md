> Aktualne sigurnosne uvjete, potvrdu FIS identiteta i redoslijed objave određuje [SECURITY-RELEASE-PLAN.md](SECURITY-RELEASE-PLAN.md). Ovaj raniji opis nije odobrenje aktivacije ni širokog pristupa.

# Zaštita — prvi funkcionalni prikaz

Zaštita se učitava kroz postojeći `fis.js`, bez izmjene glavnog HTML dokumenta. Pregled i Prijedlozi koriste postojeće zalihe, a postojeći dnevnik tretiranja, kalkulator i postavke ostaju dostupni.

## Dostupno

- Pregled kulture, očitanja Home Assistanta i postojećih vremenskih upozorenja s provjerom starosti podataka.
- Zajednički `fis_cache` i status dnevnog dohvaćanja, uz odvojenu ručnu FIS provjeru i prethodnu verziju uvjeta.
- Tekstualno filtriranje FIS primjena prema kulturi i organizmu iz povezanih zaliha. Rezultati zahtijevaju ručnu provjeru uvjeta registracije.
- Fotografije i bilješke opažanja, spremljene lokalno na uređaju. Fotografije se smanjuju prije spremanja.
- Broj evidentiranih tretiranja po kulturi i sezoni te pristup postojećem unosu.

## Ograničenja

AI identifikacija ima pripremljeno sučelje i zasebni Firebase codebase, ali zahtijeva postavljanje ključa, pravila i dopuštenih uređaja prije stvarne analize; vidi [postavljanje](FIREBASE-PEST-AI.md). Opažanja nisu sinkronizirana među uređajima. Evidencija nije vezana uz pojedinu parcelu, pa novi pregled ne izračunava dopušteni datum berbe niti preporučuje dozu ili termin tretiranja. Postojeći vremenski model je približan pokazatelj, a ne potvrda bolesti. Dnevni FIS dohvat nije sinkronizacija u stvarnom vremenu.

Firebase čitanje koristi već inicijaliziranu aplikaciju i postojeću prijavu. Nova komponenta ne piše u zajedničke kolekcije. Postojeće ručno povezivanje zalihe s FIS proizvodom ostaje zasebna radnja.

## Provjera

- `node --test tests/fis.test.cjs tests/fis-sync.test.cjs`: 10 testova normalizacije, aktualnosti i pozadinskog dohvaćanja.
- `node tests/fis-browser.cjs`: FIS povezivanje, promjena karence, neuspjeli dohvat, očuvanje količina, prikaz teksta bez HTML izvršavanja, lokalna opažanja, zajednička predmemorija i širine 320/390/1024 px.
- Isti preglednički test provjerava Firebase adapter s kontroliranim SDK odgovorima: meteo, rizik, dnevni status, tretiranja i filtriranje primjena. To nije test pristupa stvarnoj produkcijskoj bazi.

Promjene su namijenjene pregledu u draft PR-u prije spajanja i objave aplikacije.
