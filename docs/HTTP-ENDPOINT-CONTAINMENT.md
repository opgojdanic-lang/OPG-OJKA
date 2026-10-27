# HTTP endpointovi — javni invoker, interna autorizacija i kontrolirana karantena

Projekt `opg-ojka`, regija `europe-west1`, Draft PR #2. Vlasnik je potvrdio `allUsers / roles/run.invoker` na servisima `fisphotolookup`, `checksprayconditionsnow`, `ingestweather`, `plannotifynow`, `pestphotoanalyze` i `pestphotousage`. Za `fisphotolookup` dodatno je potvrđen ingress ALL i aktivna revizija prema novom nalazu ispod; za ostale servise sam binding nije dokaz ingress postavke, IAM-checka, interne autorizacije ili objavljenog izvora. Ovim pregledom nisu pozivani produkcijski HTTP endpointovi niti mijenjani IAM, Functions, pravila ili podaci. Sve mutacijske naredbe niže samo su primjeri za budući zasebno odobreni korak.

## Novo potvrđeno: privatni zajednički izvor i fisPhotoLookup

Vlasnik je potvrdio produkcijski Cloud Functions source ZIP u Cloud Storageu, **generacija `1791805687868314`**, s `index.js` i šest definicija: `fisPhotoLookup`, `ingestWeather`, `checkSprayConditions`, `checkSprayConditionsNow`, `planReminders`, `planNotifyNow`. Ranija tvrdnja da backend svih legacy funkcija nedostaje time je ispravljena: **zajednički izvor je pronađen privatno**, ali nije dostupan u ovom javnom checkoutu i ne smije se kopirati u PR. Za ostale funkcije tek treba potvrditi da njihove stvarne produkcijske revizije potječu upravo iz tog paketa; samo prisutnost exporta nije dokaz deploya ili identičnog runtimea.

Za `fisPhotoLookup` vlasnik potvrđuje handler od retka **29**; statički pregled tog handlera nije našao standardni Firebase auth, OWNER/MEMBER provjeru, obradu ulaznog Authorization headera ili eksplicitno odbijanje 401/403. Bearer provjera na retcima **177–178 pripada ingestWeather**, ne ovom handleru. Pronađen je Firestore pristup i vanjski HTTP; stvarne odredišne API-je, operacije, SDK put, naplatu, validaciju i limite treba provjeriti u privatnom izvoru, bez izmišljanja njihove implementacije.

Potvrđeno produkcijsko stanje `fisphotolookup`: **allUsers / roles/run.invoker**, ingress **ALL**, **100% prometa na `fisphotolookup-00009-jac`**, runtime SA ima projektnu **roles/editor** ulogu. To bitno povećava prioritet containmenta: javno dosegljivi handler bez pronađenog internog gatea može omogućiti neodobrenu obradu, vanjske zahtjeve/trošak i rad s Firestoreom u opsegu runtime identiteta. Editor povećava potencijalni doseg posljedica, ali nije dokaz pristupa svakoj tajni/resursu. Ovo je **visok sigurnosni rizik koji traži hitan kontrolirani odgovor**, ne dokaz da je netko ranjivost aktivno iskoristio. Nema provedenog exploit/prod HTTP testa ni potvrde stvarno pročitanih/izmijenjenih podataka ili troška.

**Blokade prije integracije popravka:** ovaj agent nema privatni ZIP ni cijeli handler; nedostaju privatni hash paketa i veza generation → build/image digest → navedena revizija, puni CORS/request/response/error ugovor, inventar svih caller URL-ova i pregled prije-prve-nuspojave. Za ostalih pet exporta treba zasebno povezati deployed izvor, identitete i okidače. IAM-check flag i alternativne/tagged rute i dalje treba potvrditi; ne poništava ih podatak 100% prometa na jednoj reviziji. Zato se neće izrađivati zamjenski handler niti nagađati FIS/AI poslovna logika. Autorizacijski sloj može se pripremiti zasebno i testirati sintetičkim handlerom; privatna integracija ostaje uvjet prije tvrdnje da je backend popravljen.

Pripremljeni javni guard, frontend kontrakt, privatna integracija i rollback: [FIS-PHOTO-AUTH-PATCH.md](FIS-PHOTO-AUTH-PATCH.md). To nije gotov privatni handler niti tvrdnja da je produkcijska rupa već zatvorena.

## Nalaz po slojevima

1. **Cloud Run transport:** `allUsers` dopušta javno pozivanje kada je invoker IAM provjera uključena i ingress dopušta zahtjev. Nije Firebase prijava niti OWNER/MEMBER uloga. Ako je `invokerIamDisabled`/`run.googleapis.com/invoker-iam-disabled` uključen, samo uklanjanje bindinga ne uspostavlja provjeru identiteta.
2. **Ingress i rute:** `all`, `internal` ili `internal-and-cloud-load-balancing` određuju mrežni put, ne aplikacijsku ulogu. Internal nije isto što i potpuna zabrana: Scheduler, odobreni interni pozivi i drugi putevi mogu ostati dostupni. Provjeriti i `run.app`, `cloudfunctions.net`, tagged revision URL-ove, custom domene/load balancer i eventualni Gen1 endpoint istog imena.
3. **Firebase `onCall`:** U provjerenom instaliranom SDK-u `checkAuthToken` poziva Admin `verifyIdToken` i tek zatim daje `request.auth`. To vrijedi uz normalnu produkcijsku konfiguraciju: privatno potvrditi da nema `FIREBASE_AUTH_EMULATOR_HOST`, Firestore emulator overridea ni debug `skipTokenVerification`/`FIREBASE_DEBUG_MODE` postavke. Snimak namjerno ne izlaže env vrijednosti, pa ovu konfiguraciju treba posebno potvrditi operator. `request.data.auth`, e-mail iz bodyja ili klijentski role flag ne smiju biti autoritet. CORS i OPTIONS odgovor nisu autorizacija. Firebase ID token nije zamjena za Google Cloud OIDC/IAM invoker token: uklanjanje javnog invokera obično zaustavlja i legitimne browser `httpsCallable` pozive.
4. **Aplikacijska autorizacija:** PR zahtijeva verificirani Google Firebase identitet, `enabled:true`, `roleVersion:1`, OWNER/MEMBER i zaštićenu singleton vezu za isti UID. Cloud IAM Owner, javni invoker ili token bez odobrene uloge sami ne otvaraju poslovne podatke. App Check u ovim callableovima nije uključen; nije zamjena za navedene provjere.
5. **Pristup podacima/trošku:** Admin SDK i Google Cloud IAM Firestore pristup zaobilaze aplikacijska Security Rules. Deny-all pravila ne zaustavljaju takav backend. Javna instanca i odbijeni zahtjevi i dalje mogu imati platformni trošak; maxInstances/budget upozorenja nisu apsolutni financijski prekidač.

Javni Cloud Run transport može biti ispravan za browser callable koji pouzdano provjerava Firebase token i ulogu. Ne treba automatski ukloniti javnost svim budućim sigurnim callableovima niti sve sadašnje javne servise proglasiti sigurnima. Za neprovjeren izvor privremena karantena je sigurniji prijelaz od pretpostavke da Google prijava u frontend aplikaciji štiti endpoint.

## Stanje svakog potvrđenog javnog servisa

Nazivi Cloud Run servisa su potvrđeni; pripadajući Cloud Functions resurs, entry point i runtime račun treba povezati preko privatnog API inventara, ne samo promjenom veličine slova.

| Cloud Run servis | Izvor / interna autorizacija | Admin SDK / trošak | Preporučeni privremeni stop i posljedice | Uvjet ponovnog uključivanja / blokada |
|---|---|---|---|---|
| `fisphotolookup` | Privatni paket gen. 1791805687868314 pronađen. Vlasnikov pregled handlera od r.29 nije našao Firebase/role/Authorization/401–403 gate; Bearer provjera r.177–178 je ingestWeather. Potvrđen ALL ingress i revizija 00009-jac na 100%. Frontend popravak tokena priprema se zasebno. | Potvrđen Firestore i vanjski HTTP; runtime SA roles/editor. Točan SDK/provider/limit treba privatno pregledati. Pest kvota 100 nije dokaz limita ovog puta. | Nakon odobrenja transportna karantena K ispod; zaustaviti otkrivene automatizirane pozive. Ne oslanjati se na `ai_private/config.enabled` bez dokaza da ga ovaj kod čita. Fotografija etikete/kalkulator automatskog popunjavanja neće raditi; ostaviti ručni unos i provjerljivu FIS pretragu. | Privatno povezati paket/build/image s revizijom i integrirati pregledani Google OWNER/MEMBER gate prije nuspojava, uz isti poslovni handler; potvrditi slike, server limit/dedupe/budžet. Frontend protokol mora odgovarati backendu. Do tada ne odobravati povrat iz predviđene K; karantena ovim zadatkom nije izvršena. |
| `checksprayconditionsnow` | Definicija pronađena u privatnom zajedničkom paketu; deployed podrijetlo i autorizacija nisu potvrđeni. Klijent radi GET bez Firebase ID tokena; odgovor može uključivati slanje obavijesti (`notified`). | Admin/Firestore/FCM i meteo API trošak nisu potvrđeni. | K; zaustaviti povezane jobove ako postoje. Ručna provjera meteo uvjeta i moguće push obavijesti neće raditi; ne tretirati postojeće podatke kao novo očitanje. | Izvor/revizija, autentikacija ručnog korisnika i/ili točno određenog Scheduler identiteta, validacija ulaza i idempotencija prije upisa/FCM. Ne vraćati javni GET s nuspojavom samo zato što frontend to očekuje. |
| `ingestweather` | Definicija u privatnom paketu ima Bearer provjeru r.177–178. To nije gate fisPhotoLookup niti dokaz Firebase/role provjere. Deployed podrijetlo, token ugovor i publisher tek treba potvrditi. | Nepoznato; potencijalni IAM/Admin upis meteo podataka. | K + dogovoreno pauziranje stvarnog izvora/queue/retryja. `weather_live`/rizik mogu zastarjeti; UI Zaštite označava stara očitanja, a odluke o tretiranju zahtijevaju aktualne podatke. Ništa ne brisati. | Identificirati publishera i izvor. Za machine-to-machine put provjeriti konkretni OIDC/IAM identitet/audience ili stvarno implementiran i pregledan potpisani webhook s anti-replay zaštitom; nije dovoljno nametnuti interaktivnu Google prijavu stroju. Do tada se ne može potvrditi zaštita. |
| `plannotifynow` | Definicija u privatnom paketu; deployed podrijetlo i autorizacija tek se potvrđuju. Gumb iz klijenta šalje GET `?digest=1` bez Firebase tokena, na izvedeni ili hardkodirani URL. | Admin/FCM čitanje i slanje nisu potvrđeni. Naziv/odgovor upućuju na obavijesti, nisu dokaz backend implementacije. | K + pauza povezanog Scheduler/ostalih stvarnih okidača. Testne i eventualno rasporedne obavijesti izostaju; planovi i kalendar ostaju spremljeni. Uračunati duple digest poruke pri retryju. | Pouzdan izvor/revizija; odvojiti autorizirani ručni OWNER/MEMBER poslovni poziv od privatnog Scheduler OIDC poziva; provjeriti odabir primatelja, privatnost i dedupe. Upravljanje rasporedom samo kroz odobreni administrativni postupak. |
| `pestphotoanalyze` | PR: `backend/pest-ai/index.js` `onCall` → `requireRole` → `analyze`. Firebase Google + OWNER/MEMBER i binding; u transakciji se ponovno provjeravaju uloga, globalni enabled i kvota. Objavljena revizija nije uspoređena s PR-om. | **Da**, Admin Firestore; OpenAI secret samo server. Limit 100 pokušaja mjesečno za ovaj analizator, dedupe, token/trošak evidencija. | Ako objavljeni kod nije potvrđen: K kao za legacy. Ako je potvrđen i kontrolni dokument zaštićen od starih širokih pravila: operator privremeno `ai_private/config.enabled=false`; po potrebi K. Novi zahtjevi/replay blokirani prije rezervacije/plaćenog poziva. Već primljen zahtjev može završiti i naplatiti se. AI fotografije bolesti/štetnika nedostupne, ostalo ručno radi. | Potvrđena nova revizija i sve rute, negativni Firebase/role testovi, zaštićen registry/control, očuvani brojači/dedupe i budžet. Browser callable smije ponovno imati javni transport tek uz te unutarnje provjere; uključiti enabled zasebno. |
| `pestphotousage` | PR: `onCall` → `requireRole` → `status`, koji ponovno provjerava ulogu/binding i enabled. Deployed verzija nije potvrđena. | **Da**, Admin čitanje; nema provider poziva ni API secret bindinga u ovom callableu. Mogući Functions/Firestore trošak. | K dok prod kod nije potvrđen. Isti AI enabled=false u PR-u blokira i usage prikaz; quota se ne briše, operator ju može privatno čitati IAM-om. | Isti Firebase/role/provenance testovi. Nakon povratka javnog transporta samo OWNER/MEMBER dobiva usage. Ne obećavati dostupan usage dok je zajednički enabled=false. |

Četiri legacy definicije pronađene su u privatnom zajedničkom paketu; **nisu kopirane, rekonstruirane ni zamijenjene** u javnom repozitoriju. Samo dodavanje Authorization headera klijentu nije dokaz da nepoznati backend provjerava potpis/issuer/audience/ulogu. Njegovo naknadno dodavanje također traži pregled CORS-a/protokola i test kompatibilnosti.

U istom privatnom paketu postoje i `checkSprayConditions` te `planReminders`. Njihova produkcijska prisutnost, tip okidača i podrijetlo nisu ovime potvrđeni. Ne uklanjati ih niti redeployati samo zato što su u istom index.js; inventar ih mora obraditi zasebno.

## Ostali pregledani backendovi u PR-u

- `opgManageMember` i `opgSecurityControl` imaju izvor, koriste Admin SDK (Auth/Firestore) i dopuštaju samo OWNER, uz ponovnu provjeru OWNER veze u transakciji i serverski audit. Ne pretpostavljati da su već objavljeni ili kakav im je produkcijski invoker IAM. Moraju proći isti pregled ruta/provenance prije otvaranja browser pristupa.
- `fisSyncDaily` je `onSchedule` u `backend/fis-sync/index.js`, Admin Firestore čita zalihe i piše cache/status, provjerava `settings/fis_sync.enabled`. Disabled grana i dalje može Admin SDK-om zapisati sync status; enabled=false nije jamstvo nula upisa i za potpunu pauzu treba zasebno pregledati/pauzirati stvarni Scheduler. Nema interaktivni OWNER/MEMBER tok; potreban je konkretni pouzdani Scheduler/Cloud IAM invoker. Njegov produkcijski IAM nije naveden u potvrdi šest servisa. Ne zaustavljati/otvarati ga automatski zbog sličnosti imena s `fisphotolookup`. Pauza odgađa FIS svježinu; zadnje cache podatke ne predstavljati kao upravo provjerene.

## Privatni inventar — dozvoljeno čitanje, bez poziva funkcija

Koristiti postojeći Cloud Shell ADC, **bez** novog login/set-quota-project/servisnog ključa. [Operatorski preflight](OPERATOR-PREFLIGHT.md) opisuje quota header i privatni output. Nakon lokalnog definiranja privatnog `opg_ops` iz tog dokumenta:

```sh
node scripts/operator-preflight.cjs --project opg-ojka --cloud-shell \
  --snapshot --out "$opg_ops/http-before"
```

Snapshot sada čuva i `function-v2-service-N.json` uz invoker policy: ingress, IAM-check flag ako ga API vraća, URL, promet/revizije i runtime metadata. Vrijednosti `environmentVariables` i Cloud Run container `env[].value` se izostavljaju, secret reference ostaju. To su privatni metapodaci, ne neovisan dokaz autorizacije koda. Nedostajući flag treba protumačiti prema stvarnoj API shemi/defaultu, ne kao dokaz uključenog checka. V1/Gen1 i named ingress/proxy putevi zahtijevaju dodatni pregled. Snapshot nije puni backup izvornog deployment paketa.

Dodatno se može samo čitati šest točno navedenih servisa, bez HTTP poziva prema njihovim URI-jima:

```sh
umask 077
for opg_svc in fisphotolookup checksprayconditionsnow ingestweather plannotifynow pestphotoanalyze pestphotousage; do
  gcloud run services describe "$opg_svc" --project=opg-ojka --region=europe-west1 \
    --format='json(metadata.name,metadata.labels,metadata.annotations,status.url,status.traffic,status.latestReadyRevisionName,spec.template.spec.serviceAccountName)' \
    > "$opg_ops/$opg_svc.service-routing.json" || break
  gcloud run services get-iam-policy "$opg_svc" --project=opg-ojka --region=europe-west1 \
    --format=json > "$opg_ops/$opg_svc.invoker.json" || break
done
```

Pregledati i projekt/folder/organizacijski efektivni IAM: `allAuthenticatedUsers`, grupe/domene, eksplicitne korisnike/SA, uvjetne bindinge, IAM Deny i invoker provjeru. Dva postojeća ljudska IAM Ownera zadržavaju operatorski oporavak; ne mijenjaju se. Povezati sa stvarnim Cloud Functions imenom/generacijom, `buildConfig.entryPoint`, codebase labelom, runtime/build SA i izvornim commitom/buildom te digestom **svake dosegljive revizije**. Repo izvor nije automatski deployed izvor. Za legacy pribaviti izvor iz pouzdanog privatnog repozitorija/build artefakta; ne kopirati nepoznate privatne pakete u javni PR.

Scheduler/Tasks/PubSub/Eventarc, vanjski senzori, korisnički bookmarkovi, stari PWA cache i druga sučelja mogu pozivati endpoint mimo sadašnjeg gumba. Za svaki izvor zabilježiti URL, identitet, audience, retry, zadnje okidanje i vlasnika. Nepoznati dependency je blokada potpunog zaustavljanja, ne dopuštenje za brisanje resursa.

## K — plan privremene transportne karantene (NE IZVRŠAVATI SADA)

K znači zabranu **neautoriziranog javnog HTTP prometa**, ne dokaz da nitko s postojećim IAM pravima ili interni okidač ne može pozivati servis.

1. Prije promjena potvrditi oba operatorska IAM puta, privatni baseline IAM/ingress/traffic/trigger snapshot i predviđeni prekid modula iz tablice. Zapisati točne postojeće bindinge i uvjete. Ne koristiti blanket projektni IAM reset.
2. Dogovoreno pauzirati otkrivene automatizirane izvore i njihove retryje/queueove, bez brisanja joba/poruka; zabilježiti prethodno stanje. To je zasebna buduća operativna promjena. Ne izmišljati job ime i ne pauzirati sve jobove u projektu.
3. Provjeriti da je Cloud Run IAM invoker check zaista uključen. Ako je isključen, uklanjanje `allUsers` ne zatvara endpoint. Uključivanje provjere mora biti zasebno odobreno i podržano vlasničkim API-jem tog servisa (Gen2 Functions može upravljati Cloud Run konfiguracijom). Ne raditi improvizirani rebuild/deploy legacy funkcije bez izvora. Ako odabrani Cloud Run alat ne može podržano promijeniti flag za managed funkciju, **stati** i pripremiti pregledanu Functions konfiguracijsku promjenu, ne brisati/redeployati servis.
4. Tek uz odobrenje ukloniti točno postojeći javni binding na jednom servisu. Provjeriti i sve druge efektivne izvore neautoriziranog pristupa. Za nesigurne druge bindinge/ingress puteve traži se zasebno ciljana promjena; ne uklanjati naslijepo potrebne Scheduler/operaterske SA ili IAM Ownere.

Primjer budućih naredbi, **nije automatizacija niti odobrenje izvršenja**; `$opg_svc` mora biti pojedinačno potvrđen servis iz tablice:

```text
# Samo ako je flag isključen, promjena podržana za taj servis i izričito odobrena:
gcloud run services update "$opg_svc" --invoker-iam-check --project=opg-ojka --region=europe-west1
# Samo za prethodno potvrđeni unconditional binding:
gcloud run services remove-iam-policy-binding "$opg_svc" --member=allUsers --role=roles/run.invoker --condition=None --project=opg-ojka --region=europe-west1
```

Ne pretpostaviti da uspješan CLI odgovor znači da je servis blokiran. Ingress se dodatno može ograničiti tek nakon provjere stvarnih izvora/ruta, uz odobrenje i odgovarajući managed API; `internal` nije univerzalni kill switch. `allAuthenticatedUsers` ili naslijeđeni široki invoker ne smiju ostati neprimijećeni. Pozivi s dovoljnim IAM pravima i dalje mogu uspjeti; za **sve nove pozive** potreban je dodatni pouzdan aplikacijski kill switch ili potpuna kontrola preostalih caller putova. Za četiri legacy produkcijska puta to zasad nije dokazano pregledom cijelog privatnog handlera i stvarne deployed verzije.

5. Pričekati prema stvarnim timeoutima i promatrati request/provider metrike, ne prema proizvoljnom sleepu. Već u tijeku zahtjev može završiti nakon IAM promjene ili enabled=false, a timeout ne jamči da provider nije naplatio obradu. Zadržati request dedupe, mjesečne brojače i financijsku evidenciju.
6. Odmah ponovno samo pročitati invoker/check/ingress/traffic stanje i provesti plan provjere ispod. Bez potvrde stvarnog odbijanja označiti servis **containment nepotvrđen** i ne otvarati ga radi uklanjanja greške klijenta.

## Dokaz odbijanja — sada bez produkcijskih HTTP proba

Ne slati ni GET, HEAD ili `?digest=1` na nepoznate funkcije tijekom ovog read-only zadatka. GET `checkSprayConditionsNow`/`planNotifyNow` može slati obavijesti ili pisati podatke; mala/neispravna slika i drugi HTTP method nisu dokaz da se nepoznati stari handler neće izvršiti ili naplatiti. Odsutnost Authorization headera također ne čini poziv bezopasnim ako karantena nije stvarno aktivna.

Prvo u izoliranom stagingu s lažnim providerom/FCM/pohranom dokazati sljedeću matricu. U produkciji se kontrolirani negativni HTTP test može izvesti tek uz posebno odobrenje, potvrđenu rutu/provenance i plan bez nuspojava. Ako to nije moguće za legacy, nema bezrizične aktivne potvrde: zadržati blokadu i nabaviti izvor, ne proglašavati endpoint sigurnim.

| Kontekst | Očekivanje u K | Nakon kontroliranog otvaranja sigurnog browser callablea |
|---|---|---|
| Bez Authorization, s dopuštenim i bez Origin headera | Cloud Run transport odbija prije handlera | Firebase `UNAUTHENTICATED` prije privatnih podataka/provider poziva |
| Nevaljani/istekli token ili token drugog Firebase projekta | Transport odbija ako nema valjani Cloud IAM invoker | Firebase SDK odbija; ne prihvatiti auth iz bodyja |
| Valjani anonimni ili Google UNAPPROVED Firebase token | Firebase token sam nije Cloud IAM invoker; nema očekivanog browser prolaza | SDK ili uloga odbija (`PERMISSION_DENIED` za neodobrenu ulogu); bez rezervacije kvote |
| Google OWNER/MEMBER Firebase token | Može biti blokiran transportom, što je očekivani prekid browsera | Dozvoljena poslovna funkcija; AI ostaje blokiran enabled kontrolom dok se zasebno ne uključi |
| Dopušteni Cloud IAM OIDC caller / Scheduler | Može proći transport ako zadržava invoker i ingress dopušta | Nije automatski Firebase OWNER/MEMBER; machine tok mora imati eksplicitnu vlastitu provjeru, ne zaobilazak |
| Stari URL, tagged stara revizija, drugi domain/LB/Gen1 put | Svaki put zasebno potvrđeno nedostupan neautoriziranom calleru | Nijedna ruta ne smije dosezati stari nesigurni handler |

U budućoj kontroliranoj produkcijskoj probi za K usporediti status/headers, routing i dostupne platformne/container logove/trace te privatno stanje Firestore/FCM/kvote i provider potrošnje. Očekuje se transportno odbijanje (tipično 401/403); 404 može značiti ingress ili pogrešan URL i nije samostalan dokaz. HTTP 200, CORS greška ili OPTIONS 204 nisu dokaz odbijanja. Odsutnost jednog aplikacijskog loga nije dokaz neizvršenja. Ne ispisivati bearer tokene, fotografije, promptove ili privatne odgovore u dijeljene logove. Ne raditi pozitivni plaćeni test samo da bi se dokazao stop; najprije staging i negativne provjere s verificiranim kodom.

## AI trošak i enabled prekidač

U PR-u `pestPhotoAnalyze` provjerava ulogu i `enabled` transakcijski **prije** rezervacije/providera. Isključenje blokira nove zahtjeve i replay, ali ne prekida već rezerviran/in-flight zahtjev. `pestPhotoUsage` se također blokira dok je enabled=false; privatni operatorski IAM ostaje put za pregled brojača. Test izričito dokazuje da već primljeni poziv može završiti te se njegova potrošnja uredno zabilježi, dok novi pokušaj ne dobiva dodatnu rezervaciju.

Dok su stara široka Firestore pravila aktivna, ne oslanjati se samo na promjenjivi enabled dokument: neodobreni korisnik ga možda može ponovno uključiti. Transportna karantena i zatvaranje klijentskih upisa moraju biti koordinirani. Nakon zaštite registry/control dokumenata operator smije po odobrenju isključiti globalnu kontrolu. Ne mijenjati OpenAI ključ, ne opozivati zajedničku tajnu niti rušiti projektni billing kao improvizirani stop; to može pogoditi druge provjerene module. Ako je zajednički provider projekt/ključ, popisati sve njegove korisnike i odobriti poseban plan ograničenja.

Limit 100, dedupe i cost evidencija vrijede za pregledani pest analizator. `fisPhotoLookup` ne smije biti vraćen s nepoznatim/neovisnim limitom uz tvrdnju da ga štiti tih 100. Potreban je dokaz server-side budžeta i odluka vlasnika o zajedničkom ili zasebnom ukupnom AI budžetu. Budget alert i maxInstances ograničavaju opažanje/skaliranje, nisu jamstvo nultog troška. Za finalnu provjeru uskladiti provider usage s nepoznatom/neobračunatom potrošnjom i već započetim zahtjevima; ne resetirati pokušaje tijekom migracije.

## Precizan redoslijed buduće migracije bez brisanja/zamjene legacy funkcija

1. **Read-only preflight/baseline:** potvrditi oba operatorska puta, projekt/regiju, šest servisa i sve pridružene Functions/URL/trigger/codebase/revizije. Privatni snapshot pravila, konfiguracije, IAM/ingress/check/traffic i brojača; pribaviti prethodni provjereni deployment artefakt. Potvrda `allUsers` ne zamjenjuje te korake. Kod hitnog incidenta ne odgađati odobreno zatvaranje radi dodatnog poliranja aplikacije.
2. **Koordinirani containment:** odobreno pauzirati stvarne neprovjerene automatizirane izvore, provesti K za legacy i za pest servise dok njihov deployed kod nije potvrđen. Zatvoriti i stare/alternativne rute, ne samo UI. Evidentirati sve preostale dopuštene machine callere/in-flight zahtjeve i nedokazane stop točke. Ovo ne proglašavati potpunim financijskim kill switchom bez dokaza.
3. **Zaštititi podatke/prekidače:** odobrenim emergency deny-all pravilima zatvoriti široki klijentski pristup te privatno postaviti AI enabled=false i pregledati ostale kontrole. Ne provizionirati role dok klijenti mogu sami pisati registry. Provjeriti neovisan IAM oporavak; Firestore pravila ne zamjenjuju korak 2. Poslovne dokumente, request ID-eve, kvotu i zalihe ne mijenjati radi prijelaza.
4. **Provjeriti izvor i kompatibilnost:** za dva pest callablea povezati ovaj PR s budućom revizijom/buildom; za četiri legacy servisa pregledati pronađeni zajednički privatni izvor i povezati ga sa svakom stvarnom produkcijskom revizijom. Bez te potvrde ne odobravati povrat nakon buduće karantene; u tom održavanju njihove funkcionalnosti bit će izričito nedostupne. Ne izmišljati entry point, ne praviti no-op zamjensku funkciju i ne mijenjati im ime.
5. **Objaviti samo pregledane ciljeve — tek nakon zasebnog odobrenja.** Root `firebase.json` ima samo codebaseove `pest-ai` i `fis-sync`; to nije inventar svih produkcijskih funkcija. Ne koristiti opći `firebase deploy`, `--only functions`, blanket codebase zamjenu, `--force`, delete ili automatsko potvrđivanje neočekivanih promjena. Za AI patch ciljati samo dvije potvrđene Functions ID oznake; primjer dopuštene selekcije (ne izvršavati sada):

   ```text
   firebase deploy --only functions:pest-ai:pestPhotoAnalyze,functions:pest-ai:pestPhotoUsage --project opg-ojka
   ```

   Prije toga provjeriti **stvarni Functions ID, generaciju, regiju, entry point i postojeću codebase pripadnost**. Selektori nisu nazivi lowercase Cloud Run servisa. Ako stvarna pripadnost/ime ne odgovara planu, stati i uskladiti manifest/plan bez preslagivanja drugih funkcija. Nema obećanja CLI deploy dry-runa: pregledati artefakt/inventar unaprijed i prekinuti pri svakom prijedlogu neočekivanog brisanja ili zamjene. Posebno nikad ne stavljati četiri nedostupna legacy endpointa u ovu selekciju.

   `opgManageMember` i `opgSecurityControl` uvode se zasebno tek nakon provjere kolizija naziva/provenance; selekcije `functions:pest-ai:opgManageMember,functions:pest-ai:opgSecurityControl`. FIS Scheduler, ako je potvrđen za ovu objavu, ide zasebno `functions:fis-sync:fisSyncDaily`. Ne objavljivati ga usput samo radi AI popravka. Selektivni deploy i dalje može promijeniti invoker IAM/reviziju na odabranom servisu: nakon **svake** takve objave ponovno provjeriti IAM-check, javnost, ingress, sve revizije/tagove i URI-je. Ne pretpostaviti da karantena ostaje identična.
6. **Nova aplikacija i OWNER pod zatvorenim poslovnim pristupom:** objaviti pregledani frontend održavanja kroz zasebno odobreni Pages postupak, prikupiti/privatno potvrditi Google UID i izvršiti pouzdani OWNER bootstrap. Nijedan Cloud IAM Owner ne dobiva automatsku app ulogu. Slijediti [ROLE-ROLLOUT.md](ROLE-ROLLOUT.md), bez brisanja anonimnog UID-a ili poslovnih podataka.
7. **Konačna pravila i administratorski pozivi:** odobreno aktivirati restriktivna pravila, potvrditi OWNER i odbijene stare anonimne/UNAPPROVED račune. Tek nakon dokaza internog OWNER gatea omogućiti potreban browser transport za pregledane management callableove. OWNER odobrava provjereni MEMBER UID; ne ponovno otvoriti legacy radi bootstrap-a.
8. **Kontrolirano otvaranje pest callableova:** prije javnog browser transporta potvrditi da nijedna stara tagged/split-traffic revizija/alternativni URL nije dosegljiv s nesigurnim kodom. Provjeriti novu Firebase/role negativnu matricu uz enabled=false; nema provider poziva/rezervacija za odbijene zahtjeve. Kada je to dokazano, povrat samo izvornog potrebnog javnog bindinga može biti ispravan za `httpsCallable`; primjer buduće odobrene selektivne obnove unconditional bindinga:

   ```text
   gcloud run services add-iam-policy-binding "$opg_svc" --member=allUsers --role=roles/run.invoker --condition=None --project=opg-ojka --region=europe-west1
   ```

   Ne vraćati stare neprovjerene široke IAM policy datoteke u cijelosti. Vratiti samo pregledani minimalni pristup i prethodno odobren ingress; Firebase provjera i registry ostaju stvarna poslovna zaštita. OWNER zasebno uključuje AI tek nakon pregleda kvote/troška i jedne izričito odobrene funkcionalne provjere. Stvarni provider test ima trošak i nije dio ovog zadatka.
9. **Legacy povrat pojedinačno:** četiri legacy endpointa ostaju predviđena za K do zasebno odobrenog povrata dok se ne ispune redak tablice, stvarni source/revision i negativne provjere. Machine ingest i Scheduler mogu ostati privatni s točnim IAM/OIDC callerima umjesto javnosti; manual browser tok zahtijeva pregledani Firebase autorizacijski backend i kompatibilan klijent. Ne vraćati allUsers automatski zato što modul javlja grešku. Ponovno uključivati samo prethodno potvrđene jobove, bez duplih obavijesti/retry stampeda.
10. **Provjera bez gubitka postojećih funkcija:** usporediti pre/post inventar po ID-u, generaciji, regiji, codebaseu, image/revision i triggerima. Očekivana izmjena mora biti točno odobreni allowlist; četiri legacy resursa ne smiju nestati, biti preimenovana ili dobiti neprovjeren novi image. Ako test ne prođe, ostati zatvoren; oporavak preko rezervnog IAM operatora i provjerenog artefakta, ne preko starih širokih pravila/nesigurnog backend rollbacka. Ne brisati funkcije, podatke ili role radi oporavka.

## Lokalni dokazi i preostale blokade

Dodani testovi provjeravaju callable entry boundary: nedostajući/body-spoofed auth ne dolazi do AI/usage/ključa, OWNER/MEMBER koriste stvarni caller UID, anonimni/neodobreni/ugašeni/orphaned ne dolaze do AI corea, a MEMBER ne može pokrenuti management transakciju. To je test handlera s mock `onCall` ugovorom, ne kriptografska provjera stvarnog Firebase JWT-a niti produkcijski HTTP test. AI shutdown test koristi lažni provider i dokazuje in-flight ograničenje. Snapshot test provjerava izostavljanje container env vrijednosti uz očuvan ingress/IAM-check/secret-reference metadata.

Ukupno **80/80 Node testova** prolazi; nema plaćenog poziva ni produkcijske promjene. Vlasnikovi potvrđeni ALL ingress, aktivna revizija i Editor za fisphotolookup navedeni su gore. Invoker-check, inherited IAM, ostale rute/digestovi i ingress ostalih servisa nisu neovisno dohvaćeni ovim Codex okruženjem s neupotrebljivim ADC-om. Zajednički privatni paket je pronađen prema vlasniku; agent ga nema u checkoutu, a deployed podrijetlo ostalih exporta nije potvrđeno. Stvarno odbijanje nakon buduće promjene nije testirano u produkciji. Zato tablica nije potvrda da su servisi već zaustavljeni ili aplikacija spremna za neograničenu produkciju.
