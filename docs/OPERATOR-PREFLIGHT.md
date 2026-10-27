# Operatorske provjere prije migracije — bez produkcijskih promjena

Projekt **opg-ojka**, Draft PR #2. Vlasnik je u Google Cloud IAM konzoli potvrdio **dva ljudska računa s IAM Owner ulogom**. To ne znači da su prijavljeni u ovom terminalu, da ADC pripada istom računu ili da već imaju aplikacijsku OWNER ulogu. Postojeći IAM se ne mijenja. Ovaj postupak ne dodjeljuje OWNER/MEMBER, ne radi deploy, ne mijenja Firestore i ne stvara/izvozi servisne privatne ključeve.

Aktualan kasniji migracijski redoslijed i oporavak: [ROLE-ROLLOUT.md](ROLE-ROLLOUT.md). Ovdje se provode samo prethodne provjere i privatno lokalno spremanje konfiguracije. Naredbe se izvršavaju na vlasnikovu pouzdanom računalu, pojedinačno uz pregled rezultata; izlaz s identitetima/konfiguracijom ne lijepiti u javni PR ili chat.

## 1. Lokalni alati i privatni radni direktorij

Potrebni su Node **22**, instalirani Google Cloud CLI (`gcloud`), Firebase CLI (kandidat je provjeren s **14.27.0**), Python 3 te zaključane backend ovisnosti. Ako Firebase CLI nije instaliran, može se koristiti `npm exec --yes --package=firebase-tools@14.27.0 -- firebase ...` umjesto `firebase ...`; to je lokalna instalacija alata, nije cloud deploy.

Iz checkouta PR grane:

```sh
node --version
gcloud version
firebase --version
git status --short
npm ci --prefix backend/pest-ai --no-audit --no-fund
opg_repo="$(pwd -P)"
umask 077
opg_private_root="$HOME/.local/share/opg-security"
mkdir -p "$opg_private_root"
chmod 700 "$opg_private_root"
opg_ops="$(mktemp -d "$opg_private_root/preflight.XXXXXXXX")"
chmod 700 "$opg_ops"
```

Očekivanje: Node v22.x, verzije obaju CLI-jeva, uspješno instalirane zaključane ovisnosti i privatni direktorij izvan repozitorija i `/workspace`. `opg_repo` mora pokazivati korijen OPG-OJKA checkouta. Ako je taj put zapravo unutar javno sinkroniziranog/distribuiranog direktorija, odabrati drugi privatni lokalni disk. Koristiti disk s enkripcijom. Snapshot nije siguran za javno dijeljenje ni nakon redakcije.

Ne koristiti `sudo`, ne mijenjati IAM radi instalacije i ne pokretati `firebase --debug` s produkcijskim podacima. CLI može stvarati debug logove i bez te opcije; zato su iduće CLI naredbe u privatnom `opg_ops` direktoriju. Ako CLI javlja problem prava lokalnog update/config storea, ispraviti lokalni vlastiti radni direktorij ili koristiti vlastiti writable XDG_CONFIG_HOME; ne prepisivati nepoznati postojeći store niti pretpostaviti da je to cloud IAM greška. U ovom cloud okruženju radni store je `/workspace/.cache/firebase/config` i update notifier se može lokalno utišati s `NO_UPDATE_NOTIFIER=1`.

## 2. Firebase CLI identitet i projekt — odvojeno od ADC-a

```sh
(cd "$opg_ops" && firebase login:list)
(cd "$opg_ops" && firebase projects:list)
(cd "$opg_ops" && firebase firestore:databases:list --project opg-ojka)
(cd "$opg_ops" && firebase functions:list --project opg-ojka)
```

Očekivanja, redom:

1. Prikazan je točno namjeravani ljudski račun. Prazan popis nije uspješna prijava. Ako treba, vlasnik lokalno izvršava `firebase login` (ili `firebase login --reauth` za postojeći račun) i bira potvrđeni IAM Owner račun. Za više računa dostupni su `firebase login:add` i `firebase login:use VLASTITI_OWNER_EMAIL`; promjene su samo lokalni izbor prijave. Ne koristiti `login:ci` i ne slati tokene u chat.
2. Popis sadrži projekt s **Project ID `opg-ojka`**. Naziv za prikaz nije dokaz ID-a. Ako se popis ne može dobiti ili projekta nema, stati; ne stvarati novi projekt.
3. Dohvaćena je postojeća Firestore baza; potvrditi `(default)` jer je koristi aplikacija/skripta. Za drugu bazu prvo uskladiti plan i release pravila.
4. Vidljiv je stvarni inventar Functions i regija. Zabilježiti Gen1/Gen2, stvarne nazive i vanjske endpointove; ne pretpostaviti da je inventar jednak repo izvozu.

Ovo su provjere pristupa **Firebase CLI identiteta**, koji može koristiti vlastiti login ili ADC. Uvijek navoditi `--project opg-ojka` gdje naredba podržava projekt. Lokalni `.firebaserc`/`firebase use` alias ili činjenica da `projects:list` radi ne dokazuju ADC pristup ni pravo deploya. Ne prikazivati CI tokene ni izvoziti lokalne auth datoteke.

## 3. gcloud prijava i ADC bez service-account ključa

```sh
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud config get-value project
gcloud projects describe opg-ojka --project=opg-ojka \
  --format='yaml(projectId,projectNumber,lifecycleState)'
```

Očekivanje: aktivni gcloud račun odgovara namjeravanom ljudskom Owneru; describe vraća `projectId: opg-ojka` i `lifecycleState: ACTIVE`. Lokalni default projekt može biti drugi: ne mijenjati ga automatski, koristiti eksplicitni `--project`. Ako gcloud nije prijavljen, vlasnik može izvršiti `gcloud auth login`, zatim ponoviti provjere. To je osobna lokalna prijava, ne izmjena IAM-a.

**gcloud login nije ADC login.** Prije odabira ADC-a provjeriti samo prisutnost overridea, bez ispisa vrijednosti:

```sh
if [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
  printf '%s\n' 'GOOGLE_APPLICATION_CREDENTIALS je postavljen; privatno provjeri izvor prije izbora ADC-a.'
fi
```

Ne otvarati/dumpati credential datoteke u logove. Postojeći `GOOGLE_APPLICATION_CREDENTIALS` može zasjeniti korisnički ADC za Node SDK. Iduće Node naredbe namjerno koriste `env -u GOOGLE_APPLICATION_CREDENTIALS` kako bi provjerile baš odabrani lokalni korisnički ADC, bez trajne promjene sesije. Za drugi već odobren keyless credential chain potreban je zaseban pregled identiteta i preduvjeta, ne slijepa zamjena.

Za prvi osnovni ADC test, samo ako korisnički ADC još nije uspostavljen:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project opg-ojka
gcloud auth application-default print-access-token >/dev/null
```

Očekivanje: osobna prijava namjeravanog Ownera, lokalno spremljen ADC s quota projektom `opg-ojka` i posljednja naredba exit 0 bez ispisa tokena. `set-quota-project` mijenja lokalnu ADC konfiguraciju i provjerava postojeći `serviceusage.services.use`; ne dodjeljuje ga. Ove naredbe **ne stvaraju niti preuzimaju service-account JSON privatni ključ**, ali lokalni ADC sadrži osjetljiv refresh token: ne kopirati ga u snapshot/repo niti dijeliti.

### Važno ograničenje Firebase Authenticationa

Prema [službenim Firebase Admin uputama](https://firebase.google.com/docs/admin/setup#test-gcloud-end-user-credentials), **Firebase Authentication ne prihvaća korisnički ADC izdan zadanim gcloud OAuth client ID-em**. Valjan token i uspješan Firestore upit zato nisu dovoljan dokaz da `listUsers`/`getUser` rade.

Ako Auth provjera ne prolazi zbog tog ograničenja, podržani ljudski keyless postupak koristi **postojeću, odobrenu Desktop OAuth client konfiguraciju**, kako navodi ista dokumentacija:

```sh
# Put mora vlasnik postaviti privatno na postojeću odobrenu Desktop OAuth konfiguraciju.
# To NIJE service-account JSON i ne smije sadržavati service_account/private_key.
opg_desktop_client='/PRIVATNI/APSOLUTNI/PUT/oauth-desktop-client.json'
gcloud auth application-default login --client-id-file="$opg_desktop_client" \
  --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email
gcloud auth application-default set-quota-project opg-ojka
gcloud auth application-default print-access-token >/dev/null
```

Zamijeniti cijeli ilustrativni put stvarnim privatnim putom, ne koristiti primjer doslovno. OAuth aplikacija mora dopuštati prijavu namjeravanog računa (consent/organizacijska politika/test users). Ne izvoziti ovu konfiguraciju ili ADC u sigurnosni snimak. Ako takva odobrena Desktop konfiguracija nije dostupna ili organizacijska politika blokira prijavu, to je **preostala blokada**; ne stvarati servisni ključ ili mijenjati IAM kao prečac. Prethodno odobrena keyless impersonacija/workload identitet mogu biti drugi put samo uz postojeće ovlasti i zasebnu provjeru; skripta je namijenjena potvrdi dvaju ljudskih operatora.

## 4. Stvarne provjere čitanja i efektivnih dozvola

```sh
cd "$opg_repo"
env -u GOOGLE_APPLICATION_CREDENTIALS node scripts/operator-preflight.cjs --project opg-ojka
```

Očekivanje: exit **0**, `ADC token: obtained` i svi testovi `PASS`; token, korisnici i poslovne vrijednosti ne ispisuju se. Skripta:

- odvojeno provjerava ADC ljudski identitet kroz Google userinfo (potrebna email scope) i projekt ID/state;
- samo čita Auth `accounts:batchGet` s najviše jednim korisnikom — ništa ne izvozi iz korisničkih profila;
- izvršava samo čitajući `runQuery` nad `zalihe` s limitom 1 — ništa ne izvozi iz poslovnih zapisa; prazan uspješan odgovor znači čitljiv upit, ne dokaz postojanja zalihe;
- provjerava bazu, aktivne Firestore release/ruleset izvore, IAM policy, obje generacije Functions i Auth konfiguraciju;
- kroz `testIamPermissions` provjerava projektne dozvole za Auth/Firestore čitanje, rules publish i Functions/Gen2/Scheduler podršku. `POST` ovdje služi upitu/provjeri dozvola, **ne produkcijskom upisu**;
- vraća exit **1** za nedostajuće ovlasti, pogrešan projekt, nepodržani ADC, 403, nedostupan API, nepotpun izvoz ili drugu blokadu. Ne ispisuje sirovi credential/error payload i ne mijenja ništa kako bi provjera prošla.

`PASS` projektnog permission testa nije deploy dry-run niti jamstvo buduće objave. IAM Deny, uvjeti, org policy, OAuth scope, API stanje, runtime/build servisni identiteti, resource-level pravila, kvote i promjene u vremenu mogu spriječiti deploy. Firebase CLI i ADC mogu biti različiti računi: ako će deploy raditi CLI račun, potvrditi da je isti kao privatno identificirani ADC ili zasebno provjeriti oba; ne pripisivati rezultat drugom identitetu.

| Svrha | Ključne provjere |
|---|---|
| Auth korisnici | `firebaseauth.users.get`, stvarni Auth sample i kompatibilan OAuth klijent |
| Firestore | `datastore.databases.get`, `datastore.entities.get/list`, stvarni read query |
| Izvoz pravila | `firebaserules.releases.get/list`, `firebaserules.rulesets.get` |
| Kasniji rules deploy | `firebase.projects.get`, `firebaserules.rulesets.create`, `firebaserules.releases.create/update` |
| Kasniji Functions deploy | `cloudfunctions.functions.get/list/create/update/sourceCodeSet`, `cloudfunctions.operations.get`; CLI provjerava i delete/setIamPolicy, što nije dopuštenje da se sad nešto briše/mijenja |
| Gen2 i Scheduler | Cloud Build, Cloud Run, Artifact Registry, Scheduler i Service Usage; testirani popis je u `PERMISSIONS` skripte |
| Stvarni runtime/build račun | zaseban resource-level `iam.serviceAccounts.actAs` za deployera; postojeće runtime dozvole za Firestore/Auth i secret binding moraju se pregledati |

Za **svaki postojeći stvarni runtime/build service account**, otkriven u privatnom inventaru Functions/Cloud Build (ne nagađati default ime), ponoviti:

```sh
opg_runtime_sa='POSTOJECI_PROVJERENI_RACUN@opg-ojka.iam.gserviceaccount.com'
env -u GOOGLE_APPLICATION_CREDENTIALS node scripts/operator-preflight.cjs \
  --project opg-ojka --service-account "$opg_runtime_sa"
```

Očekivanje: dodatni `service-account-actAs: PASS`. Ovo samo testira postojeće pravo na tom resursu; ne impersonira račun, ne daje Token Creator/actAs i ne mijenja policy. Dopuštenje `actAs` nije dokaz da runtime račun ima Auth/Firestore/Secret Manager dozvole. Njih treba neovisno pregledati u IAM/Policy Troubleshooteru nad stvarnim resursima; ne preuzimati secret payload ni mijenjati postojeće IAM uloge. Nedostajući projektni permission može biti dodijeljen uvjetno na konkretnom resursu: pregledati to privatno, ne automatski dodavati široke role. Skripta namjerno ne označava takvu nejasnoću kao spreman deploy.

Dodatni read-only inventar (privatni izlaz):

```sh
(cd "$opg_ops" && gcloud services list --enabled --project=opg-ojka \
  --format='value(config.name)')
(cd "$opg_ops" && gcloud scheduler jobs list --location=europe-west1 --project=opg-ojka \
  --format=json > scheduler-europe-west1.json)
(cd "$opg_ops" && gcloud builds list --limit=5 --project=opg-ojka \
  --format='table(id,serviceAccount,status)' > recent-build-identities.txt)
(cd "$opg_ops" && gcloud secrets describe OPG_OPENAI_API_KEY --project=opg-ojka \
  --format=json > openai-secret-metadata.json)
```

Očekivanje: postojeći relevantni API-ji i Scheduler inventar; Secret Manager opis daje **metadata**, ne tajnu. 404/403 se bilježi kao blokada i ne popravlja stvaranjem/omogućavanjem resursa. Za druge otkrivene regije ponoviti Scheduler list s njihovom stvarnom regijom. Provjeriti Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Firestore, Identity Toolkit, Firebase Rules i postojeće secret/Scheduler servise. Billing, runtime/build identitet i kvote također moraju biti valjani. Nema `services enable`, `add-iam-policy-binding`, `set-iam-policy`, secret `versions access`, `keys create`, deploy ili disable/delete naredbi u ovom preflightu.

## 5. Privatni izvoz aktualnih pravila i konfiguracije

Snimak se radi **prije** bilo kakve kasnije migracijske promjene. Ne koristiti kandidat iz repozitorija kao dokaz objavljenih pravila. Firebase CLI nema pretpostavljenu naredbu `firestore:rules:get`; skripta koristi stvarni Firebase Rules REST release i pripadajući ruleset.

```sh
env -u GOOGLE_APPLICATION_CREDENTIALS node "$opg_repo/scripts/operator-preflight.cjs" \
  --project opg-ojka --snapshot --out "$opg_ops/before"
```

Očekivanje: novi direktorij `before` s mode 0700, datoteke 0600, exit 0 i `report.json` s `complete:true`. Skripta odbija postojeći output (ne prepisuje kopiju), repo, zajednički `/workspace` i neprivatni roditeljski direktorij. Ako provjera padne, kopija je nepotpuna, ne oslanjati se na nju kao potvrđeni backup; ne prepisivati je, ponoviti u novom direktoriju nakon dijagnoze.

Sadrži aktivne `firestore-releases.json` i **`firestore-rules-N.json` s vezom na objavljeni ruleset i izvornim files/content**, project/database metadata, IAM policy v3 s uvjetima, ADC identitet, Functions v1/v2 metadata i njihove invoker policyje te odabrane konfiguracijske dokumente i postojeći `access_members` registry (s paginacijom). Default Firestore release mora biti pronađen; za druge baze/Storage/Realtime Database ovo nije potpuni izvoz. Ako `settings/security` ili nova ACL veza još ne postoji, spremi se `{exists:false}`, bez stvaranja dokumenta.

Prepoznata osjetljiva polja (npr. private key, OAuth token, hash config, API key/password) i vrijednosti Functions environment varijabli redaktiraju se; postojeći `secretEnvironmentVariables` ostaju **reference na tajne**, ne njihove vrijednosti. Ne izvoze se ADC, servisni ključevi, Auth korisnici/hashovi, poslovni uzorci, secret-version payload ili izvorni deploy bundle. Redakcija nije jamstvo odsutnosti svih mogućih tajni u nepoznatim poljima — snimak je i dalje privatan. Ovo je inventar konfiguracije i točna kopija izvora pravila, ne automatski restore paket niti puni poslovni backup. Poslovni backup/recovery treba zasebno potvrditi bez pokretanja novog produkcijskog export posla ovim zadatkom.

Provjera integriteta bez ispisa sadržaja:

```sh
python3 - "$opg_ops/before" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
report = json.loads((root / 'report.json').read_text())
assert report['projectId'] == 'opg-ojka' and report['complete'] is True
for row in json.loads((root / 'sha256-manifest.json').read_text()):
    assert hashlib.sha256((root / row['file']).read_bytes()).hexdigest() == row['sha256']
assert list(root.glob('firestore-rules-*.json'))
print('PASS: complete report, active rules source and snapshot checksums')
PY
```

Očekivanje: `PASS`. Privatno otvoriti `adc-principal.json` i `project-iam.json`, potvrditi točan identitet/uvjete i usporediti s dva ljudska Owner računa iz konzole; ne kopirati ih u PR. Manifest potvrđuje nepromijenjen lokalni sadržaj, ne dokazuje neovisni autoritet kopije. Snimak držati na šifriranom disku i napraviti vlasnički kontroliranu šifriranu kopiju na odvojenoj privatnoj lokaciji; javni Git/Pages, zajednički `/workspace` i dijeljeni environment snapshot nisu backup destinacije. Ne vraćati staro široko pravilo kao rollback.

## 6. Dokaz operatorskog pristupa nakon deny-all pravila

**Sada ne primjenjivati deny-all.** Prije budućeg odobrenog održavanja oba ljudska IAM Ownera moraju neovisno, u vlastitim privatnim terminalima/ADC kontekstima, proći projekt, Auth/Firestore read i rules/Functions permission provjere. Drugi Owner je rezervni operatorski put, ne automatski drugi aplikacijski OWNER. Provjeriti oba prije početka; nedostupnost prvog terminala/računa ne smije biti jedini put oporavka.

Nakon što u budućem posebno odobrenom koraku operator aktivira deny-all, ponoviti:

```sh
env -u GOOGLE_APPLICATION_CREDENTIALS node "$opg_repo/scripts/operator-preflight.cjs" --project opg-ojka
```

Očekivanje: Auth/Firestore read i rules read i dalje prolaze preko IAM/ADC; dobiveni Rules izvor tada mora odgovarati emergency kandidatu. Za dokaz izvora napraviti **novi** privatni `--snapshot --out "$opg_ops/after-containment"` i lokalno pregledati izvor, bez overwritea kopije `before`. Paralelno se običnom aplikacijskom Firebase korisniku, uključujući budući aplikacijski OWNER, mora odbiti poslovno čitanje/pisanje pod emergency pravilima. Dokaz se radi odvojenim app SDK/Firebase ID token kontekstom, ne ADC-om. Ne zapisivati produkcijske probne poslovne dokumente u ovom preflightu. Lokalni emulator test već provjerava tu razliku bez produkcijskih mutacija.

Razlog: privilegirani Firestore REST/Admin SDK pozivi s valjanim Google Cloud IAM pristupom ne autoriziraju se aplikacijskim Security Rules pravilima. Ali IAM Deny/istek prijave/mreža i dalje mogu blokirati operatora. Ako IAM read poslije containmenta ne radi, **ne otvarati pravila**: provjeriti identitet, ADC, quota projekt, API/mrežu, uvjete i rezervni potvrđeni Owner račun. Obnova operatorskog pristupa ide postojećim IAM/organizacijskim recovery putem; ovaj PR ne mijenja njegove role i ne nudi client auto-admin prečac.

## 7. Kontrolni popis starih AI/Admin SDK putova — priprema, bez zaustavljanja sada

- [ ] Privatno popisati Gen1/Gen2 Functions, Cloud Run URL-ove i invoker IAM, Scheduler/PubSub/Eventarc okidače i druge regije. CORS i skriveni gumb nisu zaštita endpointa.
- [ ] Uključiti `pestPhotoAnalyze`, `pestPhotoUsage`, vanjske `fisPhotoLookup` i `checkSprayConditionsNow` ako postoje; za vanjske kod nije u repozitoriju. Ne pretpostaviti da broj funkcija odgovara lokalnim exportima.
- [ ] Za svaki put dokumentirati runtime SA, tajne/reference, tko može pozivati, stvarnu serversku token/role provjeru, quota/cost kontrolu i **dokazano provjerava li enabled flag na svakom pozivu prije rezervacije/plaćenog poziva**.
- [ ] Označiti točan budući stop mehanizam i povratno stanje po endpointu. Postavljanje `ai_private/config.enabled=false` nije univerzalan stop za funkcije koje taj dokument ne čitaju; za takve putove tražiti posebno odobren operativni plan. Ne mijenjati IAM, brisati funkciju, rotirati/onesposobljavati tajnu ili pokretati deploy ovim preflightom.
- [ ] Definirati redoslijed budućeg containmenta: blokirati nove zahtjeve na svakom starom putu te držati zatvoreno do sigurne zamjene. Sam deny-all Firestore ne zaustavlja Admin SDK niti već pokrenute AI zahtjeve.
- [ ] Uračunati in-flight zahtjeve, timeout, retry, Scheduler retry i već rezerviranu mjesečnu kvotu. Ne resetirati brojače, request dedupe zapise ili trošak. Zabilježiti prethodno enabled stanje i broj pokušaja privatno.
- [ ] Pripremiti neplaćeni negativni test/staging dokaz. Ne slati stvarnu fotografiju na stari otvoreni endpoint radi dokazivanja zabrane. Čak i usage/health poziv mora imati dokaz da nema plaćene nuspojave prije produkcijske provjere.
- [ ] Po budućem odobrenom zaustavljanju provjeriti nove zahtjeve i odgodu/zaustavljanje okidača te Cloud Logging/AI provider usage; ne kopirati promptove, fotografije, tokene ili tajne u izvještaj.
- [ ] Ponovno uključiti samo uz zasebno odobrenje, nakon sigurne serverske autorizacije OWNER/MEMBER i provjere kvote/IAM-a. Ne vraćati stari neprovjereni endpoint ili široka pravila kao oporavak.

## Trenutačne blokade i dokaz iz ovog okruženja

Dva ljudska IAM Ownera potvrđena su **od korisnika**, nisu neovisno provjerena cloud API-jem. U ovom okruženju nema `gcloud` izvršne datoteke; prisutan ADC override nije omogućio token (preflight exit 1, bez ispisa credential detalja). Stvarne Auth/Firestore/Rules/Functions/IAM dozvole i privatni produkcijski snapshot stoga **nisu potvrđeni/izrađeni**. Firebase CLI paket je prisutan, ali lokalni account store nije dokaz potvrđene prijave; potrebna je vlasnička provjera gore navedenim naredbama. Nema novog servisnog ključa niti izmjene IAM-a.

Lokalni testovi skripte koriste lažne API odgovore: provjeravaju dozvoljene read/query/test rute, negativne rezultate, paginaciju, privatni output, odbijanje overwritea i izostavljanje tokena/poslovnih uzoraka/osjetljivih konfiguracijskih vrijednosti. Oni nisu dokaz produkcijskih dozvola. Dodatni gateovi ostaju stvarni Google OAuth/iPhone Safari/PWA, runtime/build IAM, vanjski backendovi, provjereno zaustavljanje starih AI putova, privatnost starijih artefakata i OWNER/MEMBER migracija prema zasebnom planu.

Završna lokalna provjera ove dopune: **63/63 Node testova** (4 nova testa operatorskog preflighta), sintaksa i `git diff --check` prolaze. Firebase CLI 14.27.0 provjeren je s writable lokalnim config storeom i utišanim update notifierom; to ne potvrđuje prijavljeni produkcijski račun. Nema deploya niti produkcijskog izvoza ovim radom.
