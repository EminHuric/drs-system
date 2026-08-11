# RDS — Restaurant Digital Solutions

Multi-tenant platforma za digitalno naručivanje. **Dva sistema u jednoj aplikaciji**:
naručivanje za stolom (sa skicom lokala) i dostava na adresu — iz istog panela, sa
porudžbinama uživo, ćaskanjem sa gostom i WhatsApp obaveštenjima.

```
Vi (RDS)  →  otvarate nalog lokalu, izdajete kod, blokirate/odblokirate
Vlasnik   →  svoj panel: meni, stolovi, porudžbine uživo, poruke, izveštaji
Gost      →  skenira QR ili otvori link: meni, korpa, sto ili adresa, praćenje
```

---

## 1. Šta vam treba (sve besplatno)

| | |
|---|---|
| Node.js | 20 ili noviji |
| Firebase projekat | besplatan **Spark** plan — nema kartice |
| Vercel nalog | besplatan Hobby plan |
| WhatsApp broj | po lokalu; preporučeno WhatsApp Business |

Sistem **ne koristi Cloud Functions ni Firebase Storage** — oba traže plaćeni Blaze
plan. Sve što bi im inače bio posao rešeno je na klijentu i u sigurnosnim pravilima.

---

## 2. Firebase — podešavanje (jednom, ~5 minuta)

### 2.1 Napravite projekat

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Google Analytics možete isključiti — nije potreban.

### 2.2 Uključite prijavu

**Build → Authentication → Get started → Sign-in method**, uključite:

- ✅ **Email/Password** — za vas i za vlasnike lokala
- ✅ **Anonymous** — za goste

> Anonimna prijava nije formalnost. Bez nje Firestore ne može da razlikuje „ovo je
> tvoja porudžbina“ od tuđe, pa bi gosti mogli da vide jedni druge. Sa njom svaki
> gost dobija sopstveni identitet bez ijednog ekrana za registraciju.

### 2.3 Napravite bazu

**Build → Firestore Database → Create database → Production mode.**
Region birajte najbliži (npr. `eur3` ili `europe-west`).

### 2.4 Prepišite podatke aplikacije

**Project settings ⚙️ → General → Your apps → Web `</>`** → registrujte aplikaciju
i prepišite vrednosti iz `firebaseConfig`.

```bash
cp .env.example .env
```

Popunite `.env`:

```ini
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=vas-projekat.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=vas-projekat
VITE_FIREBASE_STORAGE_BUCKET=vas-projekat.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

VITE_SUPER_ADMIN_EMAILS=vas@email.com
```

> Firebase web ključevi **nisu tajna** — javni su po dizajnu i vide se u svakoj
> aplikaciji. Podatke čuvaju sigurnosna pravila, ne ključ.

### 2.5 ⚠️ Postavite sigurnosna pravila (bez ovoga sistem ne radi)

Otvorite `firestore.rules`, pronađite funkciju `superAdmins()` i upišite **istu**
email adresu koju ste stavili u `VITE_SUPER_ADMIN_EMAILS`:

```javascript
function superAdmins() {
  return ['vas@email.com'];
}
```

Zatim ih pošaljite u Firebase — bilo kojim od dva načina:

```bash
# A) preko alata
npm i -g firebase-tools
firebase login
firebase use --add          # izaberite svoj projekat
firebase deploy --only firestore:rules,firestore:indexes
```

**B) ručno:** Firestore Database → **Rules** → nalepite ceo sadržaj
`firestore.rules` → **Publish**. Zatim Firestore → **Indexes** → dodajte indekse iz
`firestore.indexes.json` (ili ih preskočite — pregled platforme sam pređe na
sporiji način rada).

---

## 3. Pokretanje

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produkcija → dist/
npm run preview    # provera produkcijskog builda
```

Ako `.env` nije popunjen, aplikacija ne puca — otvara stranicu `/setup` sa uputstvom.

> ⚠️ **Ne pokrećite `npm create vite` ni bilo koji generator šablona u ovom
> folderu.** On prepisuje `src/App.vue`, `src/main.js`, `index.html`,
> `vite.config.js` i `package.json` nazad na prazan Vue primer — a naredni
> `npm install` tada izbaci `firebase`, `vue-router` i `qrcode`. Ako u browseru
> vidite *„Edit src/App.vue and save to test HMR“*, upravo se to dogodilo.

---

## 4. Prvi ulazak

1. Napravite svoj nalog: Firebase Console → **Authentication → Users → Add user** →
   unesite email iz `VITE_SUPER_ADMIN_EMAILS` i lozinku.
2. Otvorite `/login` i prijavite se tim nalogom.
3. Sistem vas prepoznaje kao **vlasnika platforme** i vodi u `/admin`.

Od tog trenutka:

| Radnja | Gde |
|---|---|
| Otvoriti nalog restoranu | Admin → Restorani → **+ Novi restoran** |
| Poslati kod vlasniku | dugme **🔑 Kod** → kopiraj ili pošalji na WhatsApp |
| Blokirati / odblokirati lokal | 🚫 / 🔓 u redu sa lokalom |
| Videti promet i porudžbine lokala | klik na naziv lokala |
| Dodati još administratora | Admin → **Administratori** |

---

## 5. Kako lokal počinje da radi

1. **Vi** otvarate nalog: naziv, web adresa, **namena** (lokal / dostava / oboje) i
   WhatsApp broj. Dobijate kod oblika `RDS-7K2M-9QX4`.
2. **Vlasnik** ide na `/register`, unosi kod i **sam pravi svoju lozinku**.
   Vi je nikada ne vidite.
3. Vlasnik prolazi kroz čarobnjak u četiri koraka (izgled → kontakt → način rada →
   početni meni) i pušta lokal u rad.
4. **Gost** otvara `/r/naziv-lokala` ili skenira QR sa stola.

QR kodove po stolovima vlasnik štampa iz **Raspored stolova → 📱 QR kodovi**.
Link `/r/naziv-lokala?sto=7` sam popunjava sto — gost ne bira ništa.

---

## 6. Ko šta sme

Ovo **nije** stvar sakrivenih dugmadi — sprovodi se u `firestore.rules`, na serveru.

| | Vlasnik platforme | Administrator | Vlasnik lokala | Gost |
|---|:--:|:--:|:--:|:--:|
| Otvoriti / obrisati lokal | ✅ | ✅ | — | — |
| Blokirati lokal | ✅ | ✅ | — | — |
| Dodati administratora | ✅ | — | — | — |
| Menjati meni i stolove | ✅ | ✅ | ✅ (svoj) | — |
| Videti porudžbine | ✅ | ✅ | ✅ (svoje) | ✅ (samo svoje) |
| Menjati status svog naloga | ✅ | ✅ | ❌ | — |

Ključne posledice:

- **Vlasnik lokala ne može sam sebe da odblokira.** Pravila mu zabranjuju izmenu
  polja `status`, `slug`, `ownerUid` i `plan` — pokušaj vraća `permission-denied`.
- **Blokiran lokal ostaje vidljiv vlasniku, ali samo za čitanje.** Podaci se ne
  brišu; gost ne može da poruči.
- **Gost vidi isključivo porudžbine koje je sam napravio.** Vezane su za njegovu
  anonimnu prijavu, a ne za pogađanje adrese.
- **Kod za aktivaciju se čita samo ako ga tačno znate.** Pretraga pozivnica je
  dozvoljena samo administratorima.

---

## 7. Objavljivanje na Vercel

1. Postavite ovaj folder u GitHub repozitorijum.
2. [vercel.com](https://vercel.com) → **Add New Project** → uvezite repo.
   Ako je `drs-system` podfolder, podesite **Root Directory** na njega.
3. **Environment Variables** → prepišite sve iz `.env`.
4. **Deploy.**

`vercel.json` već sadrži pravilo da sve adrese vode na `index.html` — bez toga bi
`/panel` i `/r/lokal` davali 404 pri osvežavanju stranice.

Na kraju: Firebase Console → **Authentication → Settings → Authorized domains** →
dodajte svoj Vercel domen, inače prijava neće raditi na produkciji.

---

## 8. Struktura

```
firestore.rules            ← ko šta sme (pravi sigurnosni sloj)
firestore.indexes.json     ← indeksi za pregled cele platforme
vercel.json                ← SPA rutiranje

src/
├── firebase.js            ← veza sa bazom + pravljenje naloga bez ispadanja iz sesije
├── router/                ← rute i zaštita po ulogama
├── stores/
│   ├── auth.js            ← sesija, uloge, živo praćenje statusa lokala
│   ├── seen.js            ← pročitane poruke (lokalno, bez upisa u bazu)
│   ├── theme.js           ← svetla / tamna tema
│   └── toast.js           ← obaveštenja + prevod Firebase grešaka
├── composables/
│   ├── useLive.js         ← Firestore pretplate vezane za životni ciklus komponente
│   ├── usePanelData.js    ← jedna pretplata za ceo panel (štedi kvotu)
│   └── useCart.js         ← korpa gosta, po lokalu, preživljava osvežavanje
├── lib/
│   ├── constants.js       ← statusi, tokovi porudžbine, bedževi
│   ├── orders.js          ← pomeranje porudžbine kroz statuse
│   ├── whatsapp.js        ← sastavljanje poruke i wa.me veze
│   ├── image.js           ← kompresija slika jela (bez Firebase Storage)
│   ├── sound.js           ← zvono za novu porudžbinu (bez zvučnog fajla)
│   ├── seedMenu.js        ← gotovi meniji za brz start
│   ├── codes.js           ← kodovi bez znakova koji se mešaju (0/O, 1/I)
│   ├── slug.js            ← naša slova → web adresa
│   ├── format.js          ← cene, vreme, telefoni u domaćem formatu
│   └── restaurant.js      ← oblik dokumenta lokala
├── components/
│   ├── FloorPlan.vue      ← skica lokala: crtanje (vlasnik) i biranje stola (gost)
│   ├── OrderCard.vue      ← kartica porudžbine, boji se kako vreme ističe
│   ├── ChatPanel.vue      ← ćaskanje, ista komponenta za obe strane
│   ├── QrCode.vue         ← QR za sto i za lokal, sa štampom
│   ├── DashShell.vue      ← okvir oba panela
│   └── ui/                ← dugmad, dijalozi, značke…
└── views/
    ├── Landing / Login / Register / Setup / NotFound
    ├── admin/             ← RDS platforma
    ├── panel/             ← vlasnik lokala
    └── guest/             ← meni i praćenje porudžbine
```

---

## 9. Model podataka

```
platform_admins/{uid}              email, name, level: super|admin
slugs/{slug}                       rezervacija web adrese (jedinstvenost)
invites/{code}                     restaurantId, used, usedBy

restaurants/{id}
  ├─ name, slug, mode, status, ownerUid, whatsappNumber, brandColor…
  ├─ categories/{id}               name, emoji, sort
  ├─ items/{id}                    name, price, image, ingredients, portion,
  │                                badges[], allergens[], sort, active
  ├─ tables/{id}                   label, zoneId, x, y, w, h  (procenti platna)
  ├─ reviews/{id}                  rating, text, photos[], itemRatings[],
  │                                verified, visible, reply
  └─ orders/{id}                   type, tableLabel, guest{}, lines[], status
       └─ messages/{id}            from: guest|staff, text
```

### Ocene i utisci

Gost ocenjuje lokal zvezdicama, napiše utisak i okači do tri fotografije
(kompresovane na ~70 KB, bez Firebase Storage-a). Ako recenziju ostavlja posle
svoje porudžbine, usput oceni i pojedina jela i dobija oznaku **„potvrđena
porudžbina"**.

Tu oznaku dodeljuju **pravila, ne aplikacija** — `verified: true` prolazi samo
ako `orderId` pokazuje na porudžbinu čiji je `guestUid` baš taj gost. Lokal na
recenziju može javno da odgovori i da je sakrije, ali **ne može da je obriše ni
da joj promeni ocenu**. Prosek se računa iz samih recenzija, jer gost po
pravilima ne sme da piše po dokumentu lokala.

### Slike

Sve slike su vlasnikove, sa njegovog telefona ili računara. Kompresuju se u
browseru i čuvaju uz sam dokument — Firebase Storage (koji traži platni profil)
nije potreban:

| Šta | Mera | Gde stoji |
|---|---|---|
| Naslovna slika lokala | ~120 KB | dokument lokala |
| Logo lokala | ~30 KB | dokument lokala |
| Galerija ambijenta (do 6) | ~70 KB svaka | dokument lokala |
| Fotografija jela | ~90 KB | dokument artikla |
| Slike uz recenziju (do 3) | ~70 KB svaka | dokument recenzije |

Firestore dozvoljava 1 MB po dokumentu; gornje mere ostavljaju rezervu i u
najgorem slučaju (lokal sa naslovnom, logom i punom galerijom).

### Dozivanje konobara

Gost pritisne dugme → u panelu iskoči ekran preko svega koji **zvoni i vibrira
sve dok neko ne pritisne „Idem"**. Namerno se ne može zatvoriti drugačije:
konobar nosi tanjire i ne gleda u ekran, pa jedno „ding" ne bi vredelo ništa.
Zvuk se pravi u browseru (`lib/sound.js`), bez ijednog zvučnog fajla.

### Rezervacija stola

Ime, prezime, telefon, datum, vreme i broj osoba. Čuva se kao porudžbina sa
`kind: 'reservation'`, pa stiže na **istu tablu** koju osoblje ionako gleda ceo
dan — jedno mesto umesto dva ekrana.

### WhatsApp je izborni kanal

Porudžbina **uvek** ide u sistem. WhatsApp je dodatak koji vlasnik gasi jednim
prekidačem. Kad je uključen, na telefonu se otvara **aplikacija** (`whatsapp://`),
ne web verzija; ako aplikacije nema, pada se nazad na `wa.me`.

### Jezici

Šest jezika (`sr` `en` `de` `it` `ru` `fr`), po 86 prevoda. Vlasnik bira osnovni
jezik svog menija, a gost ga menja jednim dodirom zastavice — turista ne mora da
zna srpski da bi naručio. **Nazivi jela se ne prevode** i ne bi trebalo:
„Ćevapi" su Ćevapi na svakom jeziku.

### Teme gost aplikacije

Lokal ne bira „svetlo ili tamno" — bira **svoj izgled**, i gost ga vidi isto na
svakom telefonu, bez obzira kako mu je uređaj podešen:

`Kao na uređaju` · `Svetlo i čisto` · `Moderno tamno` · `Luksuz (crno–zlatno,
serifni naslovi)` · `Toplo (krem–braon)` · `Minimal (crno na belom)` ·
`Zeleno (maslina i kamen)`

Uz temu ide i boja naglaska — bilo koja, preko birača boja. Podešavanja imaju
**živi pregled** koji se boji istom funkcijom kao prava gost aplikacija
(`lib/themes.js` → `themeStyle`), pa je ono što vlasnik vidi tačno ono što gost
dobija.

Položaj stolova se čuva **u procentima**, ne u pikselima — zato skica izgleda isto
na monitoru vlasnika i na telefonu gosta.

---

## 10. Besplatni plan — koliko traje

Spark plan daje **50.000 čitanja i 20.000 upisa dnevno**.

Jedna porudžbina troši ~3 upisa (porudžbina + izmene statusa) i nekoliko čitanja.
To je red veličine **nekoliko stotina porudžbina dnevno preko svih lokala**.
Sistem je pisan da štedi:

- ceo panel deli **jednu** pretplatu po kolekciji umesto po ekranu;
- brojači „koliko puta naručeno“ se računaju iz već učitanih porudžbina, bez upisa;
- nepročitane poruke se pamte lokalno, bez upisa u bazu;
- slike se čuvaju kompresovane u samom artiklu (~90 KB), bez Storage-a.

Kad prerastete besplatni plan, prelazak na Blaze ne traži nijednu izmenu koda.

---

## 11. Ako nešto ne radi

| Problem | Uzrok i rešenje |
|---|---|
| Piše „Edit src/App.vue and save to test HMR“ | Preko projekta je prošao Vite generator šablona i prepisao `App.vue`, `main.js`, `index.html`, `vite.config.js` i `package.json`. Vidi upozorenje u odeljku 3. |
| „Nemate dozvolu za ovu radnju“ | Pravila nisu poslata, ili se email u `firestore.rules` razlikuje od onog u `.env`. Moraju biti **identična**. |
| Posle prijave me vodi na početnu | Nalogu nije dodeljen lokal. Otvorite ga u Admin panelu i pošaljite kod. |
| „Način prijave nije uključen“ | Uključite Email/Password **i** Anonymous u Authentication → Sign-in method. |
| Gost ne može da poruči | Lokal nije `active` (vlasnik nije završio čarobnjak) ili je prekidač „Prima porudžbine“ isključen. |
| Pregled platforme je spor | Pošaljite indekse: `firebase deploy --only firestore:indexes`. |
| Na Vercel-u prijava ne radi | Dodajte domen u Authentication → Settings → Authorized domains. |
| `/panel` daje 404 na Vercel-u | Nedostaje `vercel.json` u Root Directory projekta. |
| WhatsApp se ne otvara | Broj mora biti u međunarodnom formatu, samo cifre (`38269123456`). |

---

## 12. Granice sistema (pošteno rečeno)

- **Gost mora jednom da pritisne „Pošalji“ u WhatsApp-u.** To je pravilo `wa.me`
  veze. Potpuno automatsko slanje traži plaćeni WhatsApp Business API i backend.
  Porudžbina je u međuvremenu **već** u panelu — WhatsApp je drugi kanal, ne jedini.
- **Plaćanje karticom se beleži kao namera, ne naplaćuje se.** Prava naplata traži
  platnog posrednika (Stripe, Monri, WSPay) i backend.
- **Nema odvojenih naloga za konobare.** Osoblje deli vlasnikov nalog.
- **Brisanje lokala ne briše poruke** unutar obrisanih porudžbina. One postaju
  nedostupne (pravila traže roditeljsku porudžbinu), ali ostaju u bazi.
