# Scenarij videa (cilj 2:50, najviše 3:00)

Video nosi 10 bodova, a bez njega se rješenje ne ocjenjuje. Snima se snimka zaslona prototipa (1920×1080) s glasom.
Govor je miran i jasan, oko 140 riječi u minuti, pa je ukupno oko 390 riječi teksta. Titlovi na hrvatskom su obavezni
(gledanje bez zvuka).

| Vrijeme | Slika | Glas (tekst) |
|---|---|---|
| 0:00–0:15 | Naslovni kadar: logo NišaRadar, ispod "Datathon 2026 · izazov C" | Svake godine više od pet tisuća ljudi u Hrvatskoj dobije potporu HZZ-a za samozapošljavanje. Jedan od kriterija je "nedostajuća djelatnost". Ali kako to netko zna? |
| 0:15–0:30 | Ivana (fotografija ili ilustracija), tekst "Ivana, 34, Beli Manastir" | Ivana iz Belog Manastira želi otvoriti frizerski salon. Treba joj objektivan argument da takva djelatnost u njezinom gradu nedostaje, i odlomak za poslovni plan. |
| 0:30–0:50 | Početna: upisuje "frizerski salon", klikne prijedlog 96.21, upiše "Beli Manastir", klikne Provjeri | NišaRadar pita samo dvije stvari: što želite pokrenuti i gdje. Iz opisa ideje predlaže službenu šifru djelatnosti NKD 2025. |
| 0:50–1:15 | Rezultat: semafor "Nedostaje", brojke 0 / 2,9 / 1–6, kursor prelazi preko grafa | U Belom Manastiru nema nijedne tvrtke u osobnim uslugama, a za grad te veličine, dobne strukture i razvijenosti očekivano je oko tri, u rasponu od jedne do šest. Graf pokazuje cijelu očekivanu razdiobu: nula je ispod uobičajenog. |
| 1:15–1:30 | Zum na žute oznake pouzdanosti | Alat je iskren. Frizeri su često obrti, a obrti nisu u Sudskom registru, pa to jasno piše. Pokazuje i je li nalaz potvrđen na strožem izvoru podataka. |
| 1:30–1:45 | Tržišni odlomak, klik "Kopiraj tekst", lijepljenje u Word | Jednim klikom Ivana dobije gotov tržišni odlomak. Svaka brojka ima izvor: Sudski registar, Popis 2021. i indeks razvijenosti. |
| 1:45–2:10 | Pregled županije: OBŽ, odjeljak 47, karta, hover preko Donjeg Miholjca, sortiranje tablice, klik "Izvoz CSV" | Marko, savjetnik HZZ-a u Osijeku, procjenjuje desetke zahtjeva. U pregledu županije vidi kartu i tablicu svih 42 grada i općine za odabranu djelatnost i izvozi ih u Excel. Isti pokazatelj, svaki put. |
| 2:10–2:30 | Izvori i ažurnost: tablica izvora s oznakom "uživo", tablica evaluacije | Podaci dolaze izravno iz API-ja Sudskog registra svake noći i spajaju se s otvorenim podacima DZS-a, ministarstva regionalnog razvoja i Državne geodetske uprave. Model smo provjerili na županijama koje nije vidio: pogreška je za trećinu manja od nacionalnog prosjeka. |
| 2:30–2:45 | Dijagram arhitekture (iz README-a), logotipi otvorenog koda | Sve je otvoreni kod pod licencom EUPL, bez poslužitelja i bez zatvorenih AI usluga. Rezultat je i novi otvoreni skup podataka, spreman za objavu na Portalu. |
| 2:45–2:55 | Ekran: "Sljedeće: obrti, eVisitor, GFI, API za mjere.hzz.hr" + URL | Sljedeći korak: obrti, turistički podaci i izravna integracija s HZZ-om. NišaRadar: dlukas99.github.io/nisaradar. |

## Kadrovi koje treba snimiti (popis za snimanje 8.11.)

1. Početna, prazna, pa tipkanje "frizerski salon" (sporo, da se vidi prijedlog).
2. JLS birač: "beli" → Enter.
3. Rezultat `#/rezultat/132/96?razred=96.21`, cijeli ekran, polagani scroll do odlomka.
4. Hover na graf (tooltip), klik "Kopiraj tekst".
5. `#/karta/14/47`: hover preko Donjeg Miholjca (trgovina na malo: 1 prema očekivanih 8,8; potvrđeno i na užem izvoru), klik na zaglavlje "Semafor", klik "Izvoz CSV".
6. `#/izvori`: oznake "uživo" i tablica evaluacije.
7. Mobitel (DevTools 390 px, tamni način): rezultat, da se vidi da radi na mobitelu.

## Napomene

- Prije snimanja provjeriti brojke na dan snimanja: podaci se osvježavaju svake noći, pa se brojke u tekstu
  (0 / 2,9 / 1–6) mogu malo promijeniti.
- "Pogreška za trećinu manja": MAE 1,58 prema 2,25 (−30 %), iz `docs/evaluacija.md`. Provjeriti nakon zadnjeg izvođenja.
- Glazba: samo bez autorskih prava (npr. YouTube Audio Library), tiho ispod glasa.
- Dozvola za objavu videa daje se u prijavi tima.
